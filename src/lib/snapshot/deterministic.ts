import { getMinMeaningfulEstimates, WINDOW_DAYS } from "@/lib/config/limits";
import { MEANINGFUL_ESTIMATE_STATUSES } from "@/lib/ingest/statuses";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ConfidenceLevel, EstimateBucket, SnapshotOutput, SnapshotResult } from "@/types/2ndlook";

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
  _sourceId: string,
  bucket: EstimateBucket,
  estimateCount: number,
  confidenceLevel: ConfidenceLevel,
): SnapshotResult {
  const totalLatency =
    bucket.latency_band_0_2 + bucket.latency_band_3_7 + bucket.latency_band_8_21 + bucket.latency_band_22_plus;
  const fastLatency = bucket.latency_band_0_2 + bucket.latency_band_3_7;
  return {
    kind: "snapshot",
    window_days: WINDOW_DAYS,
    signals: {
      source_tools: [],
      totals: {
        estimates: estimateCount,
        invoices: null,
      },
      status_breakdown: null,
    },
    scores: {
      demand_signal: Math.min(100, Math.round((estimateCount / 60) * 100)),
      cash_signal: 0,
      decision_latency: totalLatency === 0 ? 0 : Math.round((fastLatency / totalLatency) * 100),
      capacity_pressure: Math.min(
        100,
        Math.round(
          (bucket.weekly_volume.slice(-4).reduce((sum, item) => sum + item.count, 0) / Math.max(estimateCount, 1)) *
            100,
        ),
      ),
      confidence: confidenceLevel,
    },
    findings: [
      {
        title: "Deterministic snapshot",
        detail: "Signals are calculated from aggregated estimate buckets.",
      },
    ],
    next_steps: [
      {
        label: "Connect more sources",
        why: "Add invoices or more recent data for clearer signals.",
      },
    ],
    disclaimers: ["Signals are aggregated. No customer data is included."],
  };
}

function buildInsufficientDataSnapshot(estimateCount: number, requiredMinimum: number): SnapshotOutput {
  return {
    kind: "insufficient_data",
    window_days: WINDOW_DAYS,
    required_minimum: {
      estimates: requiredMinimum,
      invoices: null,
    },
    found: {
      estimates: estimateCount,
      invoices: null,
    },
    what_you_can_do_next: [
      {
        label: "Collect more estimates",
        detail: "We need more recent estimate activity to score reliably.",
      },
      {
        label: "Reconnect once volume increases",
        detail: "Reconnect after more sent/accepted estimates are available.",
      },
    ],
    confidence: "low",
    disclaimers: ["Not enough signal yet to produce a full snapshot."],
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
    .eq("source_id", source_id)
    .in("status", MEANINGFUL_ESTIMATE_STATUSES);

  if (countError || estimateCount === null) {
    throw new Error(`Failed to get estimate count: ${countError?.message || "unknown"}`);
  }

  // Determine confidence level
  const confidenceLevel = getConfidenceLevel(estimateCount);

  const requiredMinimum = getMinMeaningfulEstimates();
  const snapshotResult =
    estimateCount < requiredMinimum
      ? buildInsufficientDataSnapshot(estimateCount, requiredMinimum)
      : generateDeterministicSnapshot(source_id, bucket as EstimateBucket, estimateCount, confidenceLevel);

  // Store snapshot
  const { data: snapshot, error: snapshotError } = await supabase
    .from("snapshots")
    .insert({
      source_id,
      estimate_count: estimateCount,
      confidence_level: snapshotResult.kind === "snapshot" ? snapshotResult.scores.confidence : "low",
      result: snapshotResult,
    })
    .select("id")
    .single();

  if (snapshotError || !snapshot) {
    throw new Error(`Failed to store snapshot: ${snapshotError?.message || "unknown"}`);
  }

  // Update source status
  await supabase
    .from("sources")
    .update({
      status: snapshotResult.kind === "snapshot" ? "snapshot_generated" : "insufficient_data",
    })
    .eq("id", source_id);

  return {
    snapshot_id: snapshot.id,
  };
}
