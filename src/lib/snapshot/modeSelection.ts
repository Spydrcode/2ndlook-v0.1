import type { SnapshotMode } from "@/lib/telemetry/snapshotLog";
import { getCurrentFallbackRate, getTrackedEventCount } from "@/lib/telemetry/snapshotLog";

/**
 * Auto mode selection logic for snapshot generation
 * 
 * Decides whether to use orchestrated or deterministic mode
 * based on environment configuration and observed stability.
 * 
 * CONSERVATIVE BY DEFAULT:
 * - If in doubt, use deterministic
 * - Only use orchestrated if confidence is high
 */

export type SnapshotModeConfig = "deterministic" | "orchestrated" | "auto";

/**
 * Auto mode thresholds
 */
const AUTO_MODE_CONFIG = {
  // Maximum acceptable fallback rate (20%)
  maxFallbackRate: 0.2,
  
  // Minimum events needed to make decision
  minEvents: 10,
  
  // OpenAI key must be present
  requiresOpenAI: true,
} as const;

/**
 * Get configured snapshot mode from environment
 * Defaults to "deterministic" if not set or invalid
 */
export function getConfiguredSnapshotMode(): SnapshotModeConfig {
  const mode = process.env.SNAPSHOT_MODE?.toLowerCase();
  
  if (mode === "orchestrated" || mode === "auto") {
    return mode;
  }
  
  // Default to deterministic (safest)
  return "deterministic";
}

/**
 * Decide which mode to use based on configuration and metrics
 * 
 * Logic:
 * - If mode is "deterministic" or "orchestrated" → use that mode
 * - If mode is "auto" → make conservative decision based on:
 *   1. OpenAI key present
 *   2. Sufficient tracking data
 *   3. Fallback rate below threshold
 * 
 * @returns The mode to use for this snapshot generation
 */
export function resolveSnapshotMode(): SnapshotMode {
  const configured = getConfiguredSnapshotMode();
  
  // Direct modes: use as specified
  if (configured === "deterministic") {
    return "deterministic";
  }
  
  if (configured === "orchestrated") {
    return "orchestrated";
  }
  
  // Auto mode: make conservative decision
  return resolveAutoMode();
}

/**
 * Resolve auto mode to a concrete mode
 * Conservative: defaults to deterministic unless confidence is high
 */
function resolveAutoMode(): SnapshotMode {
  // Requirement 1: OpenAI key must be present
  if (!process.env.OPENAI_API_KEY) {
    console.log("[Auto Mode] No OpenAI key → deterministic");
    return "deterministic";
  }
  
  // Requirement 2: Sufficient tracking data
  const eventCount = getTrackedEventCount();
  if (eventCount < AUTO_MODE_CONFIG.minEvents) {
    console.log(`[Auto Mode] Insufficient data (${eventCount} events) → deterministic`);
    return "deterministic";
  }
  
  // Requirement 3: Fallback rate below threshold
  const fallbackRate = getCurrentFallbackRate();
  
  if (fallbackRate === null) {
    console.log("[Auto Mode] Cannot determine fallback rate → deterministic");
    return "deterministic";
  }
  
  if (fallbackRate > AUTO_MODE_CONFIG.maxFallbackRate) {
    console.log(`[Auto Mode] Fallback rate too high (${(fallbackRate * 100).toFixed(1)}%) → deterministic`);
    return "deterministic";
  }
  
  // All checks passed: use orchestrated
  console.log(`[Auto Mode] Stable metrics (${(fallbackRate * 100).toFixed(1)}% fallback) → orchestrated`);
  return "orchestrated";
}

/**
 * Get human-readable explanation of current mode decision
 * For debugging/monitoring
 */
export function explainModeDecision(): {
  configured: SnapshotModeConfig;
  resolved: SnapshotMode;
  reason: string;
} {
  const configured = getConfiguredSnapshotMode();
  
  if (configured === "deterministic") {
    return {
      configured,
      resolved: "deterministic",
      reason: "Configured as deterministic",
    };
  }
  
  if (configured === "orchestrated") {
    return {
      configured,
      resolved: "orchestrated",
      reason: "Configured as orchestrated",
    };
  }
  
  // Auto mode
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const eventCount = getTrackedEventCount();
  const fallbackRate = getCurrentFallbackRate();
  
  if (!hasOpenAI) {
    return {
      configured,
      resolved: "deterministic",
      reason: "Auto mode: No OpenAI key",
    };
  }
  
  if (eventCount < AUTO_MODE_CONFIG.minEvents) {
    return {
      configured,
      resolved: "deterministic",
      reason: `Auto mode: Insufficient data (${eventCount} events)`,
    };
  }
  
  if (fallbackRate === null) {
    return {
      configured,
      resolved: "deterministic",
      reason: "Auto mode: Cannot determine fallback rate",
    };
  }
  
  if (fallbackRate > AUTO_MODE_CONFIG.maxFallbackRate) {
    return {
      configured,
      resolved: "deterministic",
      reason: `Auto mode: Fallback rate too high (${(fallbackRate * 100).toFixed(1)}%)`,
    };
  }
  
  return {
    configured,
    resolved: "orchestrated",
    reason: `Auto mode: Stable (${(fallbackRate * 100).toFixed(1)}% fallback, ${eventCount} events)`,
  };
}
