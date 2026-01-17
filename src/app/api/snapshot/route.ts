import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getOrCreateInstallationId } from "@/lib/installations/cookie";
import { createSnapshotRecord } from "@/lib/snapshot/createSnapshot";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SnapshotRequest, SnapshotResponse } from "@/types/2ndlook";

function normalizeSnapshotError(error: unknown): { status: number; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes("source must be bucketed")) {
    return { status: 400, message };
  }
  if (lower.includes("no buckets found")) {
    return { status: 400, message: "Source bucket data is missing. Please re-run ingest." };
  }
  if (lower.includes("invalid source_id")) {
    return { status: 403, message: "Invalid source_id" };
  }
  if (lower.includes("snapshots_estimate_count_check")) {
    return {
      status: 400,
      message: "Not enough meaningful estimates to generate a snapshot. Please add more data and try again.",
    };
  }
  if (
    lower.includes('column "status"') ||
    lower.includes('column "input_summary"') ||
    lower.includes('column "error"') ||
    lower.includes('null value in column "result"') ||
    lower.includes("snapshots_status_check")
  ) {
    return {
      status: 500,
      message: "Snapshot schema is out of date. Apply the snapshot lifecycle migration.",
    };
  }
  if (lower.includes('null value in column "user_id"')) {
    return { status: 500, message: "Snapshot schema requires user_id. Apply no-login migration." };
  }

  return { status: 500, message: "Unable to generate snapshot. Please try again." };
}

function sanitizeErrorDetail(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("token") || lower.includes("secret") || lower.includes("authorization")) {
    return null;
  }
  return message;
}

function isSnapshotSchemaMismatch(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return (
    lower.includes('column "status"') ||
    lower.includes('column "input_summary"') ||
    lower.includes('column "error"') ||
    lower.includes('null value in column "result"') ||
    lower.includes('null value in column "user_id"') ||
    lower.includes("snapshots_status_check") ||
    lower.includes("snapshots_estimate_count_check")
  );
}

export async function POST(request: NextRequest) {
  const eventId = crypto.randomUUID();
  try {
    const installationId = await getOrCreateInstallationId();
    const supabase = createAdminClient();

    const body: SnapshotRequest = await request.json();
    const { source_id } = body;

    if (!source_id) {
      return NextResponse.json({ error: "source_id is required" }, { status: 400 });
    }

    // Verify source ownership
    const { data: source, error: sourceError } = await supabase
      .from("sources")
      .select("id, installation_id, status")
      .eq("id", source_id)
      .single();

    if (sourceError || !source || source.installation_id !== installationId) {
      return NextResponse.json({ error: "Invalid source_id" }, { status: 403 });
    }

    if (source.status !== "bucketed" && source.status !== "insufficient_data") {
      return NextResponse.json({ error: "Source must be bucketed before snapshot generation" }, { status: 400 });
    }

    let snapshot_id: string;

    try {
      const created = await createSnapshotRecord({
        installationId,
        sourceId: source_id,
      });
      snapshot_id = created.snapshot_id;
    } catch (createError) {
      if (isSnapshotSchemaMismatch(createError)) {
        console.warn("[Snapshot API] Snapshot schema mismatch; falling back to deterministic snapshot.", {
          source_id,
          event_id: eventId,
          error: createError instanceof Error ? createError.message : "unknown",
        });

        try {
          const { runDeterministicSnapshot } = await import("@/lib/snapshot/deterministic");
          const result = await runDeterministicSnapshot({
            source_id,
            installation_id: installationId,
          });
          snapshot_id = result.snapshot_id;

          return NextResponse.json({ snapshot_id }, { status: 200 });
        } catch (fallbackError) {
          const normalized = normalizeSnapshotError(fallbackError);
          console.error("[Snapshot API] Deterministic fallback failed:", {
            source_id,
            event_id: eventId,
            error: fallbackError instanceof Error ? fallbackError.message : "unknown",
          });
          return NextResponse.json(
            { error: normalized.message, event_id: eventId, detail: sanitizeErrorDetail(fallbackError) },
            { status: normalized.status },
          );
        }
      }

      throw createError;
    }

    const { data: snapshotCheck, error: snapshotCheckError } = await supabase
      .from("snapshots")
      .select("id, source_id")
      .eq("id", snapshot_id)
      .single();

    if (snapshotCheckError || !snapshotCheck) {
      console.error("[Snapshot API] Snapshot read-after-write failed:", {
        snapshot_id,
        source_id,
        event_id: eventId,
        error: snapshotCheckError?.message ?? "not_found",
      });
      return NextResponse.json(
        { error: "Snapshot created but could not be read back. Please try again.", event_id: eventId },
        { status: 500 },
      );
    }

    await supabase.from("snapshots").update({ status: "queued" }).eq("id", snapshot_id);

    void import("@/lib/snapshot/runSnapshotJob")
      .then(({ runSnapshotJob }) => runSnapshotJob(snapshot_id))
      .catch(async (jobError) => {
        console.error("[Snapshot API] Failed to trigger snapshot job:", {
          snapshot_id,
          error: jobError instanceof Error ? jobError.message : "unknown",
        });

        await supabase
          .from("snapshots")
          .update({
            status: "failed",
            error: { message: jobError instanceof Error ? jobError.message : "snapshot_job_failed" },
            completed_at: new Date().toISOString(),
          })
          .eq("id", snapshot_id);
      });

    const response: SnapshotResponse = {
      snapshot_id,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("[Snapshot API] Fatal error:", {
      event_id: eventId,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    const normalized = normalizeSnapshotError(error);
    return NextResponse.json(
      { error: normalized.message, event_id: eventId, detail: sanitizeErrorDetail(error) },
      { status: normalized.status },
    );
  }
}
