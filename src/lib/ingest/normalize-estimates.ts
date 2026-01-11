/**
 * Shared normalization logic for estimate ingestion.
 * Used by both CSV upload and OAuth connectors (Jobber, etc.)
 */

import type { CSVEstimateRow, EstimateNormalized } from "@/types/2ndlook";
import { MAX_CLOSED_ESTIMATES, MAX_DAYS } from "@/lib/config/limits";

export interface NormalizeResult {
  kept: number;
  rejected: number;
}

/**
 * Normalize and store estimate rows in the database.
 * Enforces: closed/accepted only, 90 day window, max 100 records.
 * Does NOT enforce minimum - caller should check kept >= getMinClosedEstimates().
 */
export async function normalizeAndStore(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  sourceId: string,
  rows: CSVEstimateRow[]
): Promise<NormalizeResult> {
  const now = new Date();
  const cutoffDate = new Date(now.getTime() - MAX_DAYS * 24 * 60 * 60 * 1000);

  const normalized: Omit<EstimateNormalized, "id">[] = [];
  let rejected = 0;

  for (const row of rows) {
    // Enforce: closed or accepted only
    const status = row.status.toLowerCase();
    if (status !== "closed" && status !== "accepted") {
      rejected++;
      continue;
    }

    // Parse dates
    const createdAt = new Date(row.created_at);
    const closedAt = new Date(row.closed_at);

    if (Number.isNaN(createdAt.getTime()) || Number.isNaN(closedAt.getTime())) {
      rejected++;
      continue;
    }

    // Enforce: within 90 days
    if (closedAt < cutoffDate) {
      rejected++;
      continue;
    }

    // Enforce: valid amount
    const amount = parseFloat(String(row.amount).replace(/[^0-9.-]/g, ""));
    if (Number.isNaN(amount) || amount < 0) {
      rejected++;
      continue;
    }

    // Enforce: max 100 estimates
    if (normalized.length >= MAX_CLOSED_ESTIMATES) {
      rejected++;
      continue;
    }

    normalized.push({
      estimate_id: row.estimate_id,
      source_id: sourceId,
      created_at: createdAt.toISOString(),
      closed_at: closedAt.toISOString(),
      amount,
      status: status as "closed" | "accepted",
      job_type: row.job_type || undefined,
    });
  }

  // Bulk insert
  if (normalized.length > 0) {
    const { error } = await supabase
      .from("estimates_normalized")
      .insert(normalized);

    if (error) {
      throw new Error(`Failed to insert estimates: ${error.message}`);
    }
  }

  return {
    kept: normalized.length,
    rejected: rejected + (rows.length - normalized.length - rejected),
  };
}
