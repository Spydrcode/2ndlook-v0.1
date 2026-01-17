import { createMCPClient } from "@/lib/mcp/client";
import { generateDecisionSnapshot } from "@/lib/openai/snapshot";
import { buildDeterministicSnapshot, validateBucketedAggregates } from "@/lib/orchestrator/deterministicSnapshot";
import { validateSnapshotResult } from "@/lib/orchestrator/validator";
import { resolveSnapshotMode } from "@/lib/snapshot/modeSelection";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ConfidenceLevel, SnapshotOutput } from "@/types/2ndlook";

export async function runSnapshotJob(snapshotId: string): Promise<void> {
  const supabase = createAdminClient();

  const { data: snapshot, error: snapshotError } = await supabase
    .from("snapshots")
    .select("id, source_id, status")
    .eq("id", snapshotId)
    .single();

  if (snapshotError || !snapshot) {
    console.error("[Snapshot Job] Snapshot not found:", snapshotError?.message ?? snapshotId);
    return;
  }

  if (snapshot.status === "complete" || snapshot.status === "failed" || snapshot.status === "running") {
    return;
  }

  const { data: source, error: sourceError } = await supabase
    .from("sources")
    .select("id, installation_id, status")
    .eq("id", snapshot.source_id)
    .single();

  if (sourceError || !source) {
    await supabase
      .from("snapshots")
      .update({ status: "failed", error: { message: "source_not_found" }, completed_at: new Date().toISOString() })
      .eq("id", snapshotId);
    return;
  }

  if (source.status !== "bucketed" && source.status !== "insufficient_data") {
    await supabase
      .from("snapshots")
      .update({
        status: "failed",
        error: { message: "source_not_bucketed", status: source.status },
        completed_at: new Date().toISOString(),
      })
      .eq("id", snapshotId);
    return;
  }

  await supabase
    .from("snapshots")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", snapshotId);

  try {
    const mcp = createMCPClient();
    const aggregates = await mcp.getBucketedAggregates(source.installation_id, snapshot.source_id);
    validateBucketedAggregates(aggregates);

    let snapshotResult: SnapshotOutput;
    const mode = resolveSnapshotMode();
    const useOrchestrated = mode === "orchestrated" && !!process.env.OPENAI_API_KEY;

    if (useOrchestrated) {
      snapshotResult = await generateDecisionSnapshot({ aggregates });
      validateSnapshotResult(snapshotResult);
    } else {
      snapshotResult = buildDeterministicSnapshot(aggregates, snapshot.source_id, snapshotId);
    }

    const estimateCount = aggregates.estimate_count ?? 0;
    const confidenceLevel: ConfidenceLevel =
      snapshotResult.kind === "snapshot" ? snapshotResult.scores.confidence : "low";

    await supabase
      .from("snapshots")
      .update({
        result: snapshotResult,
        estimate_count: estimateCount,
        confidence_level: confidenceLevel,
        status: "complete",
        completed_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", snapshotId);

    await supabase
      .from("sources")
      .update({
        status: snapshotResult.kind === "snapshot" ? "snapshot_generated" : "insufficient_data",
      })
      .eq("id", snapshot.source_id);
  } catch (error) {
    await supabase
      .from("snapshots")
      .update({
        status: "failed",
        error: { message: error instanceof Error ? error.message : "snapshot_job_failed" },
        completed_at: new Date().toISOString(),
      })
      .eq("id", snapshotId);
  }
}
