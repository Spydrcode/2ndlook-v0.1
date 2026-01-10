import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type {
  SnapshotRequest,
  SnapshotResponse,
} from "@/types/2ndlook";
import { runSnapshotOrchestrator } from "@/lib/orchestrator/runSnapshot";
import { runDeterministicSnapshot } from "@/lib/snapshot/deterministic";
import { resolveSnapshotMode } from "@/lib/snapshot/modeSelection";
import {
  logSnapshotEvent,
  recordSnapshotMetrics,
  SnapshotErrorCodes,
} from "@/lib/telemetry/snapshotLog";

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();

    // Verify auth
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: SnapshotRequest = await request.json();
    const { source_id } = body;

    if (!source_id) {
      return NextResponse.json(
        { error: "source_id is required" },
        { status: 400 }
      );
    }

    // Verify source ownership
    const { data: source, error: sourceError } = await supabase
      .from("sources")
      .select("id, user_id, status")
      .eq("id", source_id)
      .single();

    if (sourceError || !source || source.user_id !== user.id) {
      return NextResponse.json({ error: "Invalid source_id" }, { status: 403 });
    }

    if (source.status !== "bucketed") {
      return NextResponse.json(
        { error: "Source must be bucketed before snapshot generation" },
        { status: 400 }
      );
    }

    // Resolve snapshot mode (supports auto mode)
    const mode = resolveSnapshotMode();
    const startTime = Date.now();
    let snapshot_id: string;
    let fallbackUsed = false;
    let errorCode: string | undefined;

    if (mode === "orchestrated") {
      // Try orchestrator (AI-powered)
      try {
        console.log("[Snapshot API] Attempting orchestrated generation:", {
          source_id,
          mode: "orchestrated",
        });

        const result = await runSnapshotOrchestrator({
          source_id,
          user_id: user.id,
        });

        snapshot_id = result.snapshot_id;

        console.log("[Snapshot API] Orchestrated generation successful:", {
          snapshot_id,
          source_id,
        });
      } catch (orchestratorError) {
        // Fallback to deterministic on any orchestrator failure
        fallbackUsed = true;
        
        // Categorize error
        if (orchestratorError instanceof Error) {
          if (orchestratorError.message.includes("OpenAI")) {
            errorCode = SnapshotErrorCodes.OPENAI;
          } else if (orchestratorError.message.includes("schema") || orchestratorError.message.includes("validation")) {
            errorCode = SnapshotErrorCodes.SCHEMA;
          } else if (orchestratorError.message.includes("MCP")) {
            errorCode = SnapshotErrorCodes.MCP;
          } else {
            errorCode = SnapshotErrorCodes.UNKNOWN;
          }
        }
        
        console.error("[Snapshot API] Orchestrator failed, falling back to deterministic:", {
          source_id,
          error: orchestratorError instanceof Error ? orchestratorError.name : "Unknown",
          errorCode,
        });

        const result = await runDeterministicSnapshot({
          source_id,
          user_id: user.id,
        });

        snapshot_id = result.snapshot_id;

        console.log("[Snapshot API] Deterministic fallback successful:", {
          snapshot_id,
          source_id,
        });
      }
    } else {
      // Deterministic mode (default)
      console.log("[Snapshot API] Using deterministic generation:", {
        source_id,
        mode: "deterministic",
      });

      const result = await runDeterministicSnapshot({
        source_id,
        user_id: user.id,
      });

      snapshot_id = result.snapshot_id;
    }

    // Log telemetry
    const duration = Date.now() - startTime;
    logSnapshotEvent({
      timestamp: new Date().toISOString(),
      source_id,
      snapshot_id,
      mode_attempted: mode,
      mode_used: fallbackUsed ? "deterministic" : mode,
      fallback_used: fallbackUsed,
      error_code: errorCode,
      duration_ms: duration,
    });

    // Record metrics for auto mode
    recordSnapshotMetrics(fallbackUsed);

    const response: SnapshotResponse = {
      snapshot_id,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("[Snapshot API] Fatal error:", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    
    return NextResponse.json(
      { error: "Unable to generate snapshot. Please try again." },
      { status: 500 }
    );
  }
}
