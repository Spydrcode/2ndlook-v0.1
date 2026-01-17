import { WINDOW_DAYS } from "@/lib/config/limits";
import { createAdminClient } from "@/lib/supabase/admin";

export type SnapshotCreateResult = {
  snapshot_id: string;
  source_id: string;
};

type InputSummary = {
  window_days: number;
  estimate_count: number;
  price_bands: {
    lt_500: number;
    from_500_to_1500: number;
    from_1500_to_5000: number;
    gte_5000: number;
  };
  latency_bands: {
    days_0_2: number;
    days_3_7: number;
    days_8_21: number;
    days_22_plus: number;
  };
  weekly_volume: { week: string; count: number }[];
};

export async function createSnapshotRecord(params: {
  installationId: string;
  sourceId: string;
}): Promise<SnapshotCreateResult> {
  const supabase = createAdminClient();

  const { data: source, error: sourceError } = await supabase
    .from("sources")
    .select("id, installation_id, status")
    .eq("id", params.sourceId)
    .single();

  if (sourceError || !source || source.installation_id !== params.installationId) {
    throw new Error(`Invalid source_id: ${sourceError?.message || "not found"}`);
  }

  if (source.status !== "bucketed" && source.status !== "insufficient_data") {
    throw new Error(`Source must be bucketed before snapshot generation (current status: ${source.status})`);
  }

  const { data: bucket, error: bucketError } = await supabase
    .from("estimate_buckets")
    .select("*")
    .eq("source_id", params.sourceId)
    .single();

  if (bucketError || !bucket) {
    throw new Error(`No buckets found for source: ${bucketError?.message || "missing"}`);
  }

  const estimateCount =
    bucket.price_band_lt_500 + bucket.price_band_500_1500 + bucket.price_band_1500_5000 + bucket.price_band_5000_plus;

  const inputSummary: InputSummary = {
    window_days: WINDOW_DAYS,
    estimate_count: estimateCount,
    price_bands: {
      lt_500: bucket.price_band_lt_500,
      from_500_to_1500: bucket.price_band_500_1500,
      from_1500_to_5000: bucket.price_band_1500_5000,
      gte_5000: bucket.price_band_5000_plus,
    },
    latency_bands: {
      days_0_2: bucket.latency_band_0_2,
      days_3_7: bucket.latency_band_3_7,
      days_8_21: bucket.latency_band_8_21,
      days_22_plus: bucket.latency_band_22_plus,
    },
    weekly_volume: bucket.weekly_volume ?? [],
  };

  const generatedAt = new Date().toISOString();
  const insertPayload = {
    source_id: params.sourceId,
    estimate_count: estimateCount,
    confidence_level: "low",
    result: null,
    status: "created",
    input_summary: inputSummary,
    generated_at: generatedAt,
  };

  let snapshot: { id: string } | null = null;
  let snapshotError: { message?: string } | null = null;

  const insertResult = await supabase.from("snapshots").insert(insertPayload).select("id").single();
  snapshot = insertResult.data ?? null;
  snapshotError = insertResult.error ?? null;

  if (snapshotError || !snapshot) {
    const message = snapshotError?.message ?? "unknown";
    const lower = message.toLowerCase();
    const isSchemaCacheMiss =
      lower.includes("schema cache") ||
      lower.includes("could not find") ||
      lower.includes('column "input_summary"') ||
      lower.includes('column "status"') ||
      lower.includes('column "error"');

    if (isSchemaCacheMiss) {
      const fallbackResult = await supabase
        .from("snapshots")
        .insert({
          source_id: params.sourceId,
          estimate_count: estimateCount,
          confidence_level: "low",
          result: {},
          generated_at: generatedAt,
        })
        .select("id")
        .single();

      if (fallbackResult.error || !fallbackResult.data) {
        throw new Error(`Failed to create snapshot: ${fallbackResult.error?.message || message}`);
      }

      return { snapshot_id: fallbackResult.data.id, source_id: params.sourceId };
    }

    throw new Error(`Failed to create snapshot: ${message}`);
  }

  return { snapshot_id: snapshot.id, source_id: params.sourceId };
}
