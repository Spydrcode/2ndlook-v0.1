/**
 * Snapshot telemetry logger
 * Tracks snapshot generation mode decisions and fallbacks
 * 
 * SAFETY:
 * - No bucket payloads logged
 * - Only high-level metadata
 * - Writes to stdout as JSON lines (works with any logging infrastructure)
 * 
 * Used for:
 * - Monitoring orchestrated vs deterministic usage
 * - Calculating fallback rate for auto mode
 * - Production debugging
 */

export type SnapshotMode = "orchestrated" | "deterministic";

export interface SnapshotLogEntry {
  timestamp: string;
  source_id: string;
  snapshot_id: string;
  mode_attempted: SnapshotMode;
  mode_used: SnapshotMode;
  fallback_used: boolean;
  error_code?: string; // High-level only: E_OPENAI, E_SCHEMA, E_MCP, E_UNKNOWN
  duration_ms?: number;
}

/**
 * Error codes for categorizing snapshot failures
 */
export const SnapshotErrorCodes = {
  OPENAI: "E_OPENAI",
  SCHEMA: "E_SCHEMA",
  MCP: "E_MCP",
  UNKNOWN: "E_UNKNOWN",
} as const;

/**
 * Log a snapshot generation event
 * Writes JSON line to stdout (console.log)
 * 
 * @param entry - Snapshot log entry
 */
export function logSnapshotEvent(entry: SnapshotLogEntry): void {
  // Write as JSON line to stdout
  // This works with any logging infrastructure (CloudWatch, Datadog, etc.)
  console.log(JSON.stringify({
    ...entry,
    _type: "snapshot_telemetry",
  }));
}

/**
 * In-memory fallback rate tracker
 * Used for auto mode decision
 * 
 * Since we can't persist to DB without schema changes,
 * this tracks per-process instance only.
 */
class FallbackRateTracker {
  private events: Array<{ timestamp: number; fallback: boolean }> = [];
  private readonly maxEvents = 100; // Keep last 100 events
  private readonly windowMs = 3600000; // 1 hour window

  /**
   * Record a snapshot event
   */
  recordEvent(fallbackUsed: boolean): void {
    const now = Date.now();
    
    this.events.push({
      timestamp: now,
      fallback: fallbackUsed,
    });

    // Trim old events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Remove events outside time window
    const cutoff = now - this.windowMs;
    this.events = this.events.filter(e => e.timestamp > cutoff);
  }

  /**
   * Get current fallback rate
   * Returns null if insufficient data
   */
  getFallbackRate(): number | null {
    if (this.events.length < 5) {
      // Need at least 5 events for meaningful rate
      return null;
    }

    const fallbackCount = this.events.filter(e => e.fallback).length;
    return fallbackCount / this.events.length;
  }

  /**
   * Get event count in current window
   */
  getEventCount(): number {
    return this.events.length;
  }

  /**
   * Clear all tracked events (for testing)
   */
  clear(): void {
    this.events = [];
  }
}

// Global singleton instance
const fallbackTracker = new FallbackRateTracker();

/**
 * Record a snapshot event for fallback rate tracking
 */
export function recordSnapshotMetrics(fallbackUsed: boolean): void {
  fallbackTracker.recordEvent(fallbackUsed);
}

/**
 * Get current fallback rate
 * Returns null if insufficient data
 * 
 * Used by auto mode to decide whether to use orchestrated
 */
export function getCurrentFallbackRate(): number | null {
  return fallbackTracker.getFallbackRate();
}

/**
 * Get tracked event count
 */
export function getTrackedEventCount(): number {
  return fallbackTracker.getEventCount();
}

/**
 * Clear metrics (for testing)
 */
export function clearSnapshotMetrics(): void {
  fallbackTracker.clear();
}
