import type { SnapshotResult } from "@/types/2ndlook";

/**
 * Runtime validator for SnapshotResult
 * Ensures LLM outputs conform to locked schema
 *
 * Server-only module - used in orchestrator
 */

/**
 * Validate SnapshotResult schema at runtime
 * Throws detailed error if validation fails
 *
 * @param data - Potential SnapshotResult to validate
 * @throws Error if validation fails
 */
export function validateSnapshotResult(data: unknown): asserts data is SnapshotResult {
  if (!data || typeof data !== "object") {
    throw new Error("SnapshotResult must be an object");
  }

  const result = data as Record<string, unknown>;

  // Validate meta
  if (!result.meta || typeof result.meta !== "object") {
    throw new Error("SnapshotResult.meta is required and must be an object");
  }

  const meta = result.meta as Record<string, unknown>;

  if (typeof meta.snapshot_id !== "string") {
    throw new Error("SnapshotResult.meta.snapshot_id must be a string");
  }

  if (typeof meta.source_id !== "string") {
    throw new Error("SnapshotResult.meta.source_id must be a string");
  }

  if (typeof meta.generated_at !== "string") {
    throw new Error("SnapshotResult.meta.generated_at must be a string");
  }

  if (typeof meta.estimate_count !== "number") {
    throw new Error("SnapshotResult.meta.estimate_count must be a number");
  }

  if (
    typeof meta.confidence_level !== "string" ||
    !["low", "medium", "high"].includes(meta.confidence_level)
  ) {
    throw new Error(
      'SnapshotResult.meta.confidence_level must be "low", "medium", or "high"'
    );
  }

  // Validate demand
  if (!result.demand || typeof result.demand !== "object") {
    throw new Error("SnapshotResult.demand is required and must be an object");
  }

  const demand = result.demand as Record<string, unknown>;

  if (!Array.isArray(demand.weekly_volume)) {
    throw new Error("SnapshotResult.demand.weekly_volume must be an array");
  }

  // Validate weekly_volume items
  for (const item of demand.weekly_volume) {
    if (!item || typeof item !== "object") {
      throw new Error("SnapshotResult.demand.weekly_volume items must be objects");
    }
    const weekItem = item as Record<string, unknown>;
    if (typeof weekItem.week !== "string") {
      throw new Error("SnapshotResult.demand.weekly_volume[].week must be string");
    }
    if (typeof weekItem.count !== "number") {
      throw new Error("SnapshotResult.demand.weekly_volume[].count must be number");
    }
  }

  if (!Array.isArray(demand.price_distribution)) {
    throw new Error("SnapshotResult.demand.price_distribution must be an array");
  }

  // Validate price_distribution items
  for (const item of demand.price_distribution) {
    if (!item || typeof item !== "object") {
      throw new Error("SnapshotResult.demand.price_distribution items must be objects");
    }
    const priceItem = item as Record<string, unknown>;
    if (typeof priceItem.band !== "string") {
      throw new Error("SnapshotResult.demand.price_distribution[].band must be string");
    }
    if (typeof priceItem.count !== "number") {
      throw new Error("SnapshotResult.demand.price_distribution[].count must be number");
    }
  }

  // Validate decision_latency
  if (!result.decision_latency || typeof result.decision_latency !== "object") {
    throw new Error("SnapshotResult.decision_latency is required and must be an object");
  }

  const decisionLatency = result.decision_latency as Record<string, unknown>;

  if (!Array.isArray(decisionLatency.distribution)) {
    throw new Error("SnapshotResult.decision_latency.distribution must be an array");
  }

  // Validate distribution items
  for (const item of decisionLatency.distribution) {
    if (!item || typeof item !== "object") {
      throw new Error("SnapshotResult.decision_latency.distribution items must be objects");
    }
    const distItem = item as Record<string, unknown>;
    if (typeof distItem.band !== "string") {
      throw new Error("SnapshotResult.decision_latency.distribution[].band must be string");
    }
    if (typeof distItem.count !== "number") {
      throw new Error("SnapshotResult.decision_latency.distribution[].count must be number");
    }
  }
}

/**
 * Safe validation that returns boolean instead of throwing
 *
 * @param data - Potential SnapshotResult to validate
 * @returns true if valid, false otherwise
 */
export function isValidSnapshotResult(data: unknown): data is SnapshotResult {
  try {
    validateSnapshotResult(data);
    return true;
  } catch {
    return false;
  }
}
