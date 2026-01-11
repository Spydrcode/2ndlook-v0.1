import { createAdminClient } from "@/lib/supabase/admin";
import { MIN_CLOSED_ESTIMATES_PROD } from "@/lib/config/limits";
import type {
  EstimateBucket,
  ConfidenceLevel,
  SnapshotResult,
} from "@/types/2ndlook";

/**
 * Deterministic snapshot generation helper
 * Used as fallback when orchestrator is disabled or fails
 * Server-only module
 */

export function getConfidenceLevel(count: number): ConfidenceLevel {
  if (count < 40) return "low";
  if (count <= 60) return "medium";
  return "high";
}

export function generateDeterministicSnapshot(
  sourceId: string,
  bucket: EstimateBucket,
  estimateCount: number,
  confidenceLevel: ConfidenceLevel
): SnapshotResult {
  const now = new Date().toISOString();

  // Build price distribution
  const priceDistribution = [
    { band: "<500", count: bucket.price_band_lt_500 },
    { band: "500-1500", count: bucket.price_band_500_1500 },
    { band: "1500-5000", count: bucket.price_band_1500_5000 },
    { band: "5000+", count: bucket.price_band_5000_plus },
  ].filter((item) => item.count > 0);

  // Build latency distribution
  const latencyDistribution = [
    { band: "0-2d", count: bucket.latency_band_0_2 },
    { band: "3-7d", count: bucket.latency_band_3_7 },
    { band: "8-21d", count: bucket.latency_band_8_21 },
    { band: "22+d", count: bucket.latency_band_22_plus },
  ].filter((item) => item.count > 0);

  return {
    meta: {
      snapshot_id: "", // Will be set after insert
      source_id: sourceId,
      generated_at: now,
      estimate_count: estimateCount,
      confidence_level: confidenceLevel,
    },
    demand: {
      weekly_volume: bucket.weekly_volume,
      price_distribution: priceDistribution,
    },
    decision_latency: {
      distribution: latencyDistribution,
    },
  };
}

/**
 * Complete deterministic snapshot pipeline
 * Loads buckets, generates result, stores in DB
 */
export async function runDeterministicSnapshot(params: {
  source_id: string;
  installation_id: string;
}): Promise<{ snapshot_id: string }> {
  const { source_id, installation_id } = params;
  const supabase = createAdminClient();

  // Verify source ownership and status
  const { data: source, error: sourceError } = await supabase
    .from("sources")
    .select("id, installation_id, status")
    .eq("id", source_id)
    .single();

  if (sourceError || !source || source.installation_id !== installation_id) {
    throw new Error(`Invalid source_id: ${sourceError?.message || "not found"}`);
  }

  if (source.status !== "bucketed") {
    throw new Error(`Source must be bucketed before snapshot generation (current status: ${source.status})`);
  }

  // Fetch bucketed aggregates
  const { data: bucket, error: bucketError } = await supabase
    .from("estimate_buckets")
    .select("*")
    .eq("source_id", source_id)
    .single();

  if (bucketError || !bucket) {
    throw new Error(`No buckets found for source: ${bucketError?.message || "missing"}`);
  }

  // Get estimate count
  const { count: estimateCount, error: countError } = await supabase
    .from("estimates_normalized")
    .select("*", { count: "exact", head: true })
    .eq("source_id", source_id);

  if (countError || estimateCount === null) {
    throw new Error(`Failed to get estimate count: ${countError?.message || "unknown"}`);
  }

  // Enforce minimum constraint
  if (estimateCount < MIN_CLOSED_ESTIMATES_PROD) {
    throw new Error(
      `Minimum ${MIN_CLOSED_ESTIMATES_PROD} estimates required for snapshot (found: ${estimateCount})`
    );
  }

  // Determine confidence level
  const confidenceLevel = getConfidenceLevel(estimateCount);

  // Generate snapshot result
  const snapshotResult = generateDeterministicSnapshot(
    source_id,
    bucket as EstimateBucket,
    estimateCount,
    confidenceLevel
  );

  // Store snapshot
  const { data: snapshot, error: snapshotError } = await supabase
    .from("snapshots")
    .insert({
      source_id,
      estimate_count: estimateCount,
      confidence_level: confidenceLevel,
      result: snapshotResult,
    })
    .select("id")
    .single();

  if (snapshotError || !snapshot) {
    throw new Error(`Failed to store snapshot: ${snapshotError?.message || "unknown"}`);
  }

  // Update snapshot_id in result metadata
  const updatedResult: SnapshotResult = {
    ...snapshotResult,
    meta: {
      ...snapshotResult.meta,
      snapshot_id: snapshot.id,
    },
  };

  await supabase
    .from("snapshots")
    .update({ result: updatedResult })
    .eq("id", snapshot.id);

  // Update source status
  await supabase
    .from("sources")
    .update({ status: "snapshot_generated" })
    .eq("id", source_id);

  return {
    snapshot_id: snapshot.id,
  };
}


