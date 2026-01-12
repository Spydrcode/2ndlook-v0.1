import type {
  SnapshotResult,
  ConfidenceLevel,
} from "@/types/2ndlook";
import type { BucketedAggregates } from "@/lib/mcp/client";
import { WINDOW_DAYS } from "@/lib/config/limits";

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
  source_id: string,
  snapshot_id = ""
): SnapshotResult {
  const confidenceLevel = getConfidenceLevel(aggregates.estimate_count);
  const totalLatency = aggregates.latency_distribution.reduce(
    (sum, item) => sum + item.count,
    0
  );
  const fastLatency = aggregates.latency_distribution
    .filter((item) => item.band === "0-2d" || item.band === "3-7d")
    .reduce((sum, item) => sum + item.count, 0);
  const invoiceCount = aggregates.invoiceSignals?.invoice_count ?? null;

  const statusBreakdown = aggregates.invoiceSignals
    ? Object.fromEntries(
        aggregates.invoiceSignals.status_distribution.map((item) => [
          item.status,
          item.count,
        ])
      )
    : null;

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
      demand_signal: Math.min(100, Math.round((aggregates.estimate_count / 60) * 100)),
      cash_signal:
        invoiceCount === null
          ? 0
          : Math.min(
              100,
              Math.round((invoiceCount / Math.max(aggregates.estimate_count, 1)) * 100)
            ),
      decision_latency:
        totalLatency === 0 ? 0 : Math.round((fastLatency / totalLatency) * 100),
      capacity_pressure: Math.min(
        100,
        Math.round((aggregates.weekly_volume.slice(-4).reduce((sum, item) => sum + item.count, 0) / Math.max(aggregates.estimate_count, 1)) * 100)
      ),
      confidence: confidenceLevel,
    },
    findings: [
      {
        title: "Deterministic fallback",
        detail: "Snapshot generated without the model based on aggregate signals.",
      },
    ],
    next_steps: [
      {
        label: "Review signal coverage",
        why: "Ensure recent estimates and invoices are connected for sharper scoring.",
      },
    ],
    disclaimers: ["Signals are aggregated. No customer data is included."],
  };
}

/**
 * Validate that aggregates have required structure
 * Throws if missing required fields
 */
export function validateBucketedAggregates(
  aggregates: unknown
): asserts aggregates is BucketedAggregates {
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
}
