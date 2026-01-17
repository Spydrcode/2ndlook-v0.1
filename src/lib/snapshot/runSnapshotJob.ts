import { createMCPClient } from "@/lib/mcp/client";
import { generateDecisionSnapshot } from "@/lib/openai/snapshot";
import { buildDeterministicSnapshot, validateBucketedAggregates } from "@/lib/orchestrator/deterministicSnapshot";
import { validateSnapshotResult } from "@/lib/orchestrator/validator";
import { resolveSnapshotMode } from "@/lib/snapshot/modeSelection";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ConfidenceLevel, SnapshotOutput } from "@/types/2ndlook";

type BucketRow = {
  price_band_lt_500: number;
  price_band_500_1500: number;
  price_band_1500_5000: number;
  price_band_5000_plus: number;
  latency_band_0_2: number;
  latency_band_3_7: number;
  latency_band_8_21: number;
  latency_band_22_plus: number;
  weekly_volume: { week: string; count: number }[] | null;
};

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
    const useMcp = !!process.env.MCP_SERVER_URL;
    let aggregates: import("@/lib/mcp/client").BucketedAggregates;

    if (useMcp) {
      const mcp = createMCPClient();
      aggregates = await mcp.getBucketedAggregates(source.installation_id, snapshot.source_id);
    } else {
      const { data: bucket, error: bucketError } = await supabase
        .from("estimate_buckets")
        .select(
          "price_band_lt_500, price_band_500_1500, price_band_1500_5000, price_band_5000_plus, latency_band_0_2, latency_band_3_7, latency_band_8_21, latency_band_22_plus, weekly_volume",
        )
        .eq("source_id", snapshot.source_id)
        .single();

      if (bucketError || !bucket) {
        throw new Error(`No buckets found for source: ${bucketError?.message || "missing"}`);
      }

      const estimateCount =
        bucket.price_band_lt_500 +
        bucket.price_band_500_1500 +
        bucket.price_band_1500_5000 +
        bucket.price_band_5000_plus;

      const bucketRow = bucket as BucketRow;
      aggregates = {
        source_id: snapshot.source_id,
        estimate_count: estimateCount,
        weekly_volume: bucketRow.weekly_volume ?? [],
        price_distribution: [
          { band: "<500", count: bucketRow.price_band_lt_500 },
          { band: "500-1500", count: bucketRow.price_band_500_1500 },
          { band: "1500-5000", count: bucketRow.price_band_1500_5000 },
          { band: "5000+", count: bucketRow.price_band_5000_plus },
        ],
        latency_distribution: [
          { band: "0-2d", count: bucketRow.latency_band_0_2 },
          { band: "3-7d", count: bucketRow.latency_band_3_7 },
          { band: "8-21d", count: bucketRow.latency_band_8_21 },
          { band: "22+d", count: bucketRow.latency_band_22_plus },
        ],
      };
    }

    validateBucketedAggregates(aggregates);

    let snapshotResult: SnapshotOutput;
    const mode = resolveSnapshotMode();
    const useOrchestrated = useMcp && mode === "orchestrated" && !!process.env.OPENAI_API_KEY;

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
