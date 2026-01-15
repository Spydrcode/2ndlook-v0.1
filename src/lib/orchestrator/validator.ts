import { snapshotOutputSchema } from "@/lib/openai/schemas";
import type { SnapshotOutput } from "@/types/2ndlook";

/**
 * Runtime validator for snapshot outputs
 * Ensures LLM outputs conform to the structured schema
 *
 * Server-only module - used in orchestrator
 */
export function validateSnapshotResult(data: unknown): asserts data is SnapshotOutput {
  snapshotOutputSchema.parse(data);
}

/**
 * Safe validation that returns boolean instead of throwing
 */
export function isValidSnapshotResult(data: unknown): data is SnapshotOutput {
  try {
    validateSnapshotResult(data);
    return true;
  } catch {
    return false;
  }
}
