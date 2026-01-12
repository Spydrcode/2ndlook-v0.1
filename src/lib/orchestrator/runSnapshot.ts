import { createAdminClient } from "@/lib/supabase/admin";
import { generateDecisionSnapshot } from "@/lib/openai/snapshot";
import { createMCPClient } from "@/lib/mcp/client";
import { WINDOW_DAYS } from "@/lib/config/limits";
import {
  buildDeterministicSnapshot,
  validateBucketedAggregates,
} from "@/lib/orchestrator/deterministicSnapshot";
import { validateSnapshotResult } from "@/lib/orchestrator/validator";
import type { SnapshotOutput, ConfidenceLevel } from "@/types/2ndlook";

/**
 * Orchestrator for 2ndlook v0.1 snapshot pipeline
 * Server-only module - never import on client
 *
 * SAFETY RULES (ENFORCED):
 * 1. Agent never sees raw estimate rows (bucket-only via MCP)
 * 2. Agent input is bucketed aggregates only
 * 3. Agent output is JSON-only, matching SnapshotOutput schema
 * 4. Max 1 agent call per snapshot (v0.1)
 * 5. No DB schema changes
 *
 * NEW: Uses MCP server for all data access
 * - get_bucketed_aggregates (read)
 * - write_snapshot_result (write)
 */

export interface RunSnapshotParams {
  source_id: string;
  installation_id: string;
}

export interface RunSnapshotResult {
  snapshot_id: string;
}

/**
 * Run the complete snapshot pipeline using MCP tools:
 * 1. Create snapshot record (get snapshot_id)
 * 2. Fetch bucketed aggregates via MCP (no raw estimates)
 * 3. Try orchestrated: Call OpenAI agent once with safe input
 * 4. Write result via MCP
 * 5. Return snapshot_id
 *
 * FALLBACK: If LLM fails, use deterministic generation
 *
 * @param params - Source and user identifiers
 * @returns snapshot_id of the generated snapshot
 * @throws Error if both orchestrated and deterministic fail
 */
export async function runSnapshotOrchestrator(
  params: RunSnapshotParams
): Promise<RunSnapshotResult> {
  const { source_id, installation_id } = params;

  const supabase = createAdminClient();
  const mcp = createMCPClient();

  // Step 1: Create snapshot record first (to get snapshot_id)
  const { data: snapshot, error: snapshotError } = await supabase
    .from("snapshots")
    .insert({
      source_id,
      estimate_count: 0, // Will be updated
      confidence_level: "low", // Will be updated
      result: {}, // Will be updated with full result
    })
    .select("id")
    .single();

  if (snapshotError || !snapshot) {
    throw new Error(
      `Failed to create snapshot record: ${snapshotError?.message || "unknown"}`
    );
  }

  const snapshot_id = snapshot.id;

  try {
    // Step 2: Fetch bucketed aggregates via MCP (no direct DB access)
    console.log("[Orchestrator] Fetching bucketed aggregates via MCP:", {
      source_id,
      snapshot_id,
    });

    const aggregates = await mcp.getBucketedAggregates(installation_id, source_id);

    // Validate aggregates structure
    validateBucketedAggregates(aggregates);

    // Step 3: Prepare safe agent input (aggregates only)
    const invoiceStatusCounts = aggregates.invoiceSignals
      ? Object.fromEntries(
          aggregates.invoiceSignals.status_distribution.map((item) => [
            item.status,
            item.count,
          ])
        )
      : undefined;

    const agentInput = {
      windowDays: WINDOW_DAYS,
      connectorTools: aggregates.source_tool ? [aggregates.source_tool] : [],
      estimateSignals: {
        countsByStatus: {},
        totals: { estimates: aggregates.estimate_count },
      },
      invoiceSignals: aggregates.invoiceSignals
        ? {
            countsByStatus: invoiceStatusCounts ?? {},
            totals: { invoices: aggregates.invoiceSignals.invoice_count },
          }
        : undefined,
    };

    // Step 4: Try orchestrated generation with OpenAI (max 1 call)
    console.log("[Orchestrator] Calling OpenAI for snapshot generation:", {
      snapshot_id,
      estimate_count: aggregates.estimate_count,
    });

    let snapshotResult: SnapshotOutput;

    try {
      // OpenAI call (max 1 per v0.1 constraint)
      snapshotResult = await generateDecisionSnapshot(agentInput);

      // Validate LLM output matches schema
      validateSnapshotResult(snapshotResult);

      console.log("[Orchestrator] OpenAI generation successful:", {
        snapshot_id,
      });
    } catch (llmError) {
      // Fallback to deterministic if LLM fails
      console.warn(
        "[Orchestrator] LLM generation failed, using deterministic fallback:",
        {
          snapshot_id,
          error: llmError instanceof Error ? llmError.name : "Unknown",
        }
      );

      snapshotResult = buildDeterministicSnapshot(
        aggregates,
        source_id,
        snapshot_id
      );
    }

    // Step 5: Write result via MCP
    console.log("[Orchestrator] Writing snapshot result via MCP:", {
      snapshot_id,
    });

    await mcp.writeSnapshotResult({
      installation_id,
      snapshot_id,
      result_json: snapshotResult,
    });

    const estimateCount =
      snapshotResult.kind === "snapshot"
        ? snapshotResult.signals.totals.estimates ?? 0
        : snapshotResult.found.estimates ?? 0;
    const confidenceLevel: ConfidenceLevel =
      snapshotResult.kind === "snapshot"
        ? snapshotResult.scores.confidence
        : "low";

    // Step 6: Update snapshot record with metadata
    await supabase
      .from("snapshots")
      .update({
        estimate_count: estimateCount,
        confidence_level: confidenceLevel,
      })
      .eq("id", snapshot_id);

    // Step 7: Update source status
    await supabase
      .from("sources")
      .update({
        status:
          snapshotResult.kind === "snapshot"
            ? "snapshot_generated"
            : "insufficient_data",
      })
      .eq("id", source_id);

    console.log("[Orchestrator] Snapshot pipeline complete:", {
      snapshot_id,
      source_id,
      estimate_count: estimateCount,
      confidence_level: confidenceLevel,
    });

    return {
      snapshot_id,
    };
  } catch (error) {
    // Critical error: MCP failed AND deterministic fallback failed
    console.error("[Orchestrator] Fatal error - both paths failed:", {
      snapshot_id,
      source_id,
      error: error instanceof Error ? error.message : "Unknown",
    });

    // Clean up failed snapshot record
    await supabase.from("snapshots").delete().eq("id", snapshot_id);

    throw new Error(
      `Snapshot generation failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}


