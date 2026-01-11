import type {
  SnapshotResult,
  ConfidenceLevel,
} from "@/types/2ndlook";
import type { BucketedAggregates } from "@/lib/mcp/client";

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
  const now = new Date().toISOString();
  const confidenceLevel = getConfidenceLevel(aggregates.estimate_count);

  // Filter zero-count bands
  const priceDistribution = aggregates.price_distribution.filter(
    (item) => item.count > 0
  );

  const latencyDistribution = aggregates.latency_distribution.filter(
    (item) => item.count > 0
  );

  const result: SnapshotResult = {
    meta: {
      snapshot_id,
      source_id,
      generated_at: now,
      estimate_count: aggregates.estimate_count,
      confidence_level: confidenceLevel,
      invoice_count: aggregates.invoiceSignals?.invoice_count,
    },
    demand: {
      weekly_volume: aggregates.weekly_volume,
      price_distribution: priceDistribution,
    },
    decision_latency: {
      distribution: latencyDistribution,
    },
  };

  // Add invoice signals if available
  if (aggregates.invoiceSignals) {
    result.invoiceSignals = {
      price_distribution: aggregates.invoiceSignals.price_distribution.filter(
        (item) => item.count > 0
      ),
      time_to_invoice: aggregates.invoiceSignals.time_to_invoice.filter(
        (item) => item.count > 0
      ),
      status_distribution: aggregates.invoiceSignals.status_distribution.filter(
        (item) => item.count > 0
      ),
      weekly_volume: aggregates.invoiceSignals.weekly_volume,
    };
  }

  return result;
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
