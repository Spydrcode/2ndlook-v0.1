import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateInstallationId } from "@/lib/installations/cookie";
import type { BucketRequest, BucketResponse, EstimateNormalized } from "@/types/2ndlook";
import { MEANINGFUL_ESTIMATE_STATUSES } from "@/lib/ingest/statuses";

export async function POST(request: NextRequest) {
  try {
    const installationId = await getOrCreateInstallationId();
    const supabase = createAdminClient();

    const body: BucketRequest = await request.json();
    const { source_id } = body;

    if (!source_id) {
      return NextResponse.json(
        { error: "source_id is required" },
        { status: 400 }
      );
    }

    // Verify source ownership and status
    const { data: source, error: sourceError } = await supabase
      .from("sources")
      .select("id, installation_id, status, metadata")
      .eq("id", source_id)
      .single();

    if (sourceError || !source || source.installation_id !== installationId) {
      return NextResponse.json({ error: "Invalid source_id" }, { status: 403 });
    }

    if (source.status !== "ingested" && source.status !== "insufficient_data") {
      return NextResponse.json(
        { error: "Source must be ingested before bucketing" },
        { status: 400 }
      );
    }

    // Fetch normalized estimates
    const { data: estimates, error: estimatesError } = await supabase
      .from("estimates_normalized")
      .select("*")
      .eq("source_id", source_id);

    if (estimatesError || !estimates || estimates.length === 0) {
      return NextResponse.json(
        { error: "No estimates found for source" },
        { status: 400 }
      );
    }

    // Apply bucketing rules
    const buckets = bucketEstimates(estimates as EstimateNormalized[]);

    // Check if bucket already exists
    const { data: existingBucket } = await supabase
      .from("estimate_buckets")
      .select("id")
      .eq("source_id", source_id)
      .single();

    if (existingBucket) {
      // Update existing
      const { error: updateError } = await supabase
        .from("estimate_buckets")
        .update(buckets)
        .eq("source_id", source_id);

      if (updateError) {
        throw new Error(`Failed to update buckets: ${updateError.message}`);
      }
    } else {
      // Insert new
      const { error: insertError } = await supabase
        .from("estimate_buckets")
        .insert({ ...buckets, source_id });

      if (insertError) {
        throw new Error(`Failed to insert buckets: ${insertError.message}`);
      }
    }

    if (source.status !== "insufficient_data") {
      await supabase
        .from("sources")
        .update({ status: "bucketed" })
        .eq("id", source_id);
    }

    const statusForResponse =
      source.status === "insufficient_data" ? "insufficient_data" : "bucketed";

    const response: BucketResponse = {
      source_id,
      bucketed: true,
    };

    return NextResponse.json(
      {
        ...response,
        status: statusForResponse,
        metadata: source.metadata ?? null,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Bucket error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function bucketEstimates(estimates: EstimateNormalized[]) {
  // Price band counters
  let priceBandLt500 = 0;
  let priceBand5001500 = 0;
  let priceBand15005000 = 0;
  let priceBand5000Plus = 0;

  // Latency band counters
  let latencyBand02 = 0;
  let latencyBand37 = 0;
  let latencyBand821 = 0;
  let latencyBand22Plus = 0;

  // Weekly volume map
  const weeklyMap = new Map<string, number>();

  for (const estimate of estimates) {
    if (!MEANINGFUL_ESTIMATE_STATUSES.includes(estimate.status)) {
      continue;
    }

    const amount = estimate.amount;
    const createdAt = new Date(estimate.created_at);
    const closedAt = estimate.closed_at ? new Date(estimate.closed_at) : null;
    const updatedAt = estimate.updated_at ? new Date(estimate.updated_at) : null;
    const activityDate = closedAt ?? updatedAt ?? createdAt;

    if (Number.isNaN(createdAt.getTime()) || Number.isNaN(activityDate.getTime())) {
      continue;
    }

    // Price bands
    if (amount < 500) {
      priceBandLt500++;
    } else if (amount < 1500) {
      priceBand5001500++;
    } else if (amount < 5000) {
      priceBand15005000++;
    } else {
      priceBand5000Plus++;
    }

    // Decision latency (days)
    if (closedAt && !Number.isNaN(closedAt.getTime())) {
      const latencyMs = closedAt.getTime() - createdAt.getTime();
      const latencyDays = Math.floor(latencyMs / (1000 * 60 * 60 * 24));

      if (latencyDays <= 2) {
        latencyBand02++;
      } else if (latencyDays <= 7) {
        latencyBand37++;
      } else if (latencyDays <= 21) {
        latencyBand821++;
      } else {
        latencyBand22Plus++;
      }
    }

    // Weekly volume (ISO week)
    const weekKey = getISOWeek(activityDate);
    weeklyMap.set(weekKey, (weeklyMap.get(weekKey) || 0) + 1);
  }

  // Convert weekly map to array
  const weeklyVolume = Array.from(weeklyMap.entries())
    .map(([week, count]) => ({ week, count }))
    .sort((a, b) => a.week.localeCompare(b.week));

  return {
    price_band_lt_500: priceBandLt500,
    price_band_500_1500: priceBand5001500,
    price_band_1500_5000: priceBand15005000,
    price_band_5000_plus: priceBand5000Plus,
    latency_band_0_2: latencyBand02,
    latency_band_3_7: latencyBand37,
    latency_band_8_21: latencyBand821,
    latency_band_22_plus: latencyBand22Plus,
    weekly_volume: weeklyVolume,
  };
}

function getISOWeek(date: Date): string {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const weekNumber = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  const year = target.getFullYear();
  return `${year}-W${String(weekNumber).padStart(2, "0")}`;
}


