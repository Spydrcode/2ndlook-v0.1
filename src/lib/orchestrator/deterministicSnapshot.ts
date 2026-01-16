import { WINDOW_DAYS } from "@/lib/config/limits";
import type { BucketedAggregates } from "@/lib/mcp/client";
import type { ConfidenceLevel, SnapshotResult } from "@/types/2ndlook";

/**
 * Deterministic snapshot builder for orchestrator
 * Takes bucket-only aggregates and produces SnapshotResult
 *
 * RULES:
 * - Input: bucket-only aggregates from MCP
 * - Output: locked SnapshotResult schema
 * - No LLM call, no raw estimates
 * - Confidence from estimate count
 * - No prose, no extra fields
 *
 * Server-only module
 */

/**
 * Calculate confidence level based on estimate count
 */
export function getConfidenceLevel(count: number): ConfidenceLevel {
  if (count < 40) return "low";
  if (count <= 60) return "medium";
  return "high";
}

/**
 * Build deterministic SnapshotResult from bucketed aggregates
 *
 * @param aggregates - Bucketed data from MCP server
 * @param source_id - Source identifier
 * @param snapshot_id - Snapshot identifier (empty string if not yet created)
 * @returns SnapshotResult conforming to locked schema
 */
export function buildDeterministicSnapshot(
  aggregates: BucketedAggregates,
  _source_id: string,
  _snapshot_id = "",
): SnapshotResult {
  const confidenceLevel = getConfidenceLevel(aggregates.estimate_count);
  const totalLatency = aggregates.latency_distribution.reduce((sum, item) => sum + item.count, 0);
  const fastLatency = aggregates.latency_distribution
    .filter((item) => item.band === "0-2d" || item.band === "3-7d")
    .reduce((sum, item) => sum + item.count, 0);
  const invoiceCount = aggregates.invoiceSignals?.invoice_count ?? null;

  const statusBreakdown = aggregates.invoiceSignals
    ? Object.fromEntries(aggregates.invoiceSignals.status_distribution.map((item) => [item.status, item.count]))
    : null;

  const recentVolume = aggregates.weekly_volume.slice(-4);
  const recentTotal = recentVolume.reduce((sum, item) => sum + item.count, 0);
  const recentAvg = recentVolume.length > 0 ? recentTotal / recentVolume.length : 0;
  const priorVolume = aggregates.weekly_volume.slice(0, -4);
  const priorAvg =
    priorVolume.length > 0 ? priorVolume.reduce((sum, item) => sum + item.count, 0) / priorVolume.length : recentAvg;

  const demandTrend = recentAvg > priorAvg * 1.15 ? "up" : recentAvg < priorAvg * 0.85 ? "down" : "flat";

  const priceMix = aggregates.price_distribution.reduce(
    (acc, band) => ({ ...acc, [band.band]: band.count }),
    {} as Record<string, number>,
  );
  const highValueShare = (priceMix["1500-5000"] ?? 0) + (priceMix["5000+"] ?? 0);
  const repeatClientRatio =
    typeof aggregates.repeat_client_ratio === "number" && Number.isFinite(aggregates.repeat_client_ratio)
      ? aggregates.repeat_client_ratio
      : null;
  const repeatClientCount = aggregates.repeat_client_count ?? 0;
  const uniqueClientCount = aggregates.unique_client_count ?? 0;
  const topCity = aggregates.geo_city_distribution?.[0];
  const topPostal = aggregates.geo_postal_prefix_distribution?.[0];

  const findings: Array<{ title: string; detail: string }> = [
    {
      title: "Demand rhythm",
      detail:
        demandTrend === "up"
          ? "Recent weekly volume is rising; line up capacity now so you can keep pace without scrambling."
          : demandTrend === "down"
            ? "Volume dipped versus earlier weeks; pause hiring and focus on re-engaging warm leads."
            : "Weekly volume is steady; stay the course but keep an eye on any week-over-week wobble.",
    },
    {
      title: "Decision speed",
      detail:
        totalLatency === 0
          ? "No closed decisions yet; set a 48-hour follow-up rule to establish a baseline quickly."
          : fastLatency / Math.max(totalLatency, 1) >= 0.6
            ? "Most decisions land inside a week; keep responses tight and avoid adding extra steps."
            : "Decisions are stretching out; trim quote steps and schedule proactive follow-ups to close faster.",
    },
  ];

  if (repeatClientRatio !== null) {
    const repeatDetail =
      repeatClientRatio >= 0.5
        ? "Repeat clients are anchoring bookings; protect them with priority scheduling and proactive check-ins."
        : "Most work is one-off; build a simple post-completion follow-up to turn wins into the next booked job.";
    const repeatLabel =
      repeatClientCount > 0 && uniqueClientCount > 0
        ? `${repeatClientCount}/${uniqueClientCount} clients are coming back`
        : "Repeat signal spotted";
    findings.push({
      title: "Repeat leverage",
      detail: `${repeatDetail} (${repeatLabel}).`,
    });
  }

  if (topCity || topPostal) {
    const geoLabel = topCity?.city ?? (topPostal?.prefix ? `postal ${topPostal.prefix}` : "local cluster");
    findings.push({
      title: "Geo focus",
      detail: `Work is clustering around ${geoLabel}; deepen presence there before widening your radius.`,
    });
  }

  const nextSteps = [
    {
      label: "Tighten follow-up on slow decisions",
      why: "Aging quotes add latency; set a 48-hour follow-up for anything not closed in a week.",
    },
  ];

  if (repeatClientRatio !== null) {
    nextSteps.push({
      label: "Install a repeat loop",
      why: "A simple post-completion check-in turns one-off wins into the next booking without storing PII.",
    });
  } else if (topCity || topPostal) {
    nextSteps.push({
      label: "Prioritize your densest zone",
      why: "Stack crews and offers where volume clusters before expanding your service radius.",
    });
  } else {
    nextSteps.push({
      label: "Tag job types consistently",
      why: "Cleaner job-type data sharpens pricing and staffing calls without exposing PII.",
    });
  }

  return {
    kind: "snapshot",
    window_days: WINDOW_DAYS,
    signals: {
      source_tools: aggregates.source_tool ? [aggregates.source_tool] : [],
      totals: {
        estimates: aggregates.estimate_count,
        invoices: invoiceCount,
      },
      status_breakdown: statusBreakdown,
    },
    scores: {
      demand_signal: Math.min(
        100,
        Math.round(
          (aggregates.estimate_count / 60) * 100 + (demandTrend === "up" ? 10 : demandTrend === "down" ? -10 : 0),
        ),
      ),
      cash_signal:
        invoiceCount === null
          ? 0
          : Math.min(100, Math.round((invoiceCount / Math.max(aggregates.estimate_count, 1)) * 100)),
      decision_latency: totalLatency === 0 ? 0 : Math.round((fastLatency / totalLatency) * 100),
      capacity_pressure: Math.min(
        100,
        Math.round((recentAvg / Math.max(priorAvg || 1, 1)) * 50 + (highValueShare ? 10 : 0)),
      ),
      confidence: confidenceLevel,
    },
    findings,
    next_steps: nextSteps,
    disclaimers: ["Signals are aggregated. No customer data is included."],
  };
}

/**
 * Validate that aggregates have required structure
 * Throws if missing required fields
 */
export function validateBucketedAggregates(aggregates: unknown): asserts aggregates is BucketedAggregates {
  if (!aggregates || typeof aggregates !== "object") {
    throw new Error("Invalid aggregates: must be an object");
  }

  const agg = aggregates as Record<string, unknown>;

  if (typeof agg.source_id !== "string") {
    throw new Error("Invalid aggregates: source_id must be string");
  }

  if (typeof agg.estimate_count !== "number") {
    throw new Error("Invalid aggregates: estimate_count must be number");
  }

  if (!Array.isArray(agg.weekly_volume)) {
    throw new Error("Invalid aggregates: weekly_volume must be array");
  }

  if (!Array.isArray(agg.price_distribution)) {
    throw new Error("Invalid aggregates: price_distribution must be array");
  }

  if (!Array.isArray(agg.latency_distribution)) {
    throw new Error("Invalid aggregates: latency_distribution must be array");
  }

  if (agg.job_type_distribution && !Array.isArray(agg.job_type_distribution)) {
    throw new Error("Invalid aggregates: job_type_distribution must be array if provided");
  }

  if (agg.weekly_volume.length > 104) {
    throw new Error("Invalid aggregates: weekly_volume too large");
  }

  for (const item of agg.price_distribution as any[]) {
    if (typeof item?.count !== "number") {
      throw new Error("Invalid aggregates: price_distribution counts must be numbers");
    }
  }

  for (const item of agg.latency_distribution as any[]) {
    if (typeof item?.count !== "number") {
      throw new Error("Invalid aggregates: latency_distribution counts must be numbers");
    }
  }

  if (agg.job_type_distribution) {
    if ((agg.job_type_distribution as any[]).length > 100) {
      throw new Error("Invalid aggregates: job_type_distribution too large");
    }
    for (const item of agg.job_type_distribution as any[]) {
      if (typeof item?.count !== "number") {
        throw new Error("Invalid aggregates: job_type_distribution counts must be numbers");
      }
    }
  }

  if (agg.unique_client_count !== undefined && typeof agg.unique_client_count !== "number") {
    throw new Error("Invalid aggregates: unique_client_count must be number if provided");
  }

  if (agg.repeat_client_count !== undefined && typeof agg.repeat_client_count !== "number") {
    throw new Error("Invalid aggregates: repeat_client_count must be number if provided");
  }

  if (agg.repeat_client_ratio !== undefined) {
    const ratio = agg.repeat_client_ratio as number;
    if (typeof ratio !== "number" || Number.isNaN(ratio) || !Number.isFinite(ratio)) {
      throw new Error("Invalid aggregates: repeat_client_ratio must be a finite number if provided");
    }
  }

  if (agg.geo_city_distribution) {
    if (!Array.isArray(agg.geo_city_distribution)) {
      throw new Error("Invalid aggregates: geo_city_distribution must be array if provided");
    }
    if ((agg.geo_city_distribution as any[]).length > 50) {
      throw new Error("Invalid aggregates: geo_city_distribution too large");
    }
    for (const item of agg.geo_city_distribution as any[]) {
      if (typeof item?.count !== "number" || typeof item?.city !== "string") {
        throw new Error("Invalid aggregates: geo_city_distribution items must have city and count");
      }
    }
  }

  if (agg.geo_postal_prefix_distribution) {
    if (!Array.isArray(agg.geo_postal_prefix_distribution)) {
      throw new Error("Invalid aggregates: geo_postal_prefix_distribution must be array if provided");
    }
    if ((agg.geo_postal_prefix_distribution as any[]).length > 50) {
      throw new Error("Invalid aggregates: geo_postal_prefix_distribution too large");
    }
    for (const item of agg.geo_postal_prefix_distribution as any[]) {
      if (typeof item?.count !== "number" || typeof item?.prefix !== "string") {
        throw new Error("Invalid aggregates: geo_postal_prefix_distribution items must have prefix and count");
      }
      if (item.prefix.length > 5) {
        throw new Error("Invalid aggregates: postal prefix too long");
      }
    }
  }
}
