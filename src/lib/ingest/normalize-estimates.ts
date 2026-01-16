/**
 * Shared normalization logic for estimate ingestion.
 * Used by both CSV upload and OAuth connectors (Jobber, etc.)
 */

import { MAX_ESTIMATE_RECORDS, WINDOW_DAYS } from "@/lib/config/limits";
import { MEANINGFUL_ESTIMATE_STATUSES, normalizeEstimateStatus } from "@/lib/ingest/statuses";
import type { CSVEstimateRow, EstimateNormalized } from "@/types/2ndlook";

export interface NormalizeResult {
  kept: number;
  rejected: number;
  meaningful: number;
}

/**
 * Normalize and store estimate rows in the database.
 * Enforces: 90 day window, max 100 records.
 * Does NOT enforce minimum - caller should check kept >= getMinMeaningfulEstimates().
 */
export async function normalizeAndStore(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  sourceId: string,
  rows: CSVEstimateRow[],
): Promise<NormalizeResult> {
  const now = new Date();
  const cutoffDate = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const normalized: Omit<EstimateNormalized, "id">[] = [];
  let _rejected = 0;
  let meaningful = 0;

  for (const row of rows) {
    // Parse dates
    const createdAt = new Date(row.created_at);
    const closedAt = row.closed_at ? new Date(row.closed_at) : null;
    const updatedAt = row.updated_at ? new Date(row.updated_at) : null;

    if (Number.isNaN(createdAt.getTime())) {
      _rejected++;
      continue;
    }

    // Enforce: within 90 days
    const activityDate = closedAt ?? updatedAt ?? createdAt;
    if (Number.isNaN(activityDate.getTime()) || activityDate < cutoffDate) {
      _rejected++;
      continue;
    }

    // Enforce: valid amount
    const amount = parseFloat(String(row.amount).replace(/[^0-9.-]/g, ""));
    if (Number.isNaN(amount) || amount < 0) {
      _rejected++;
      continue;
    }

    // Enforce: max 100 estimates
    if (normalized.length >= MAX_ESTIMATE_RECORDS) {
      _rejected++;
      continue;
    }

    const normalizedStatus = normalizeEstimateStatus(row.status);

    const clientId = row.client_id !== undefined && row.client_id !== null ? String(row.client_id).trim() : "";
    const jobId = row.job_id !== undefined && row.job_id !== null ? String(row.job_id).trim() : "";
    const geoCityRaw =
      row.geo_city !== undefined && row.geo_city !== null ? String(row.geo_city).trim().toLowerCase() : "";
    const geoPostalRaw =
      row.geo_postal !== undefined && row.geo_postal !== null ? String(row.geo_postal).replace(/[^a-z0-9]/gi, "") : "";

    normalized.push({
      estimate_id: row.estimate_id,
      source_id: sourceId,
      created_at: createdAt.toISOString(),
      closed_at: closedAt ? closedAt.toISOString() : null,
      updated_at: updatedAt ? updatedAt.toISOString() : null,
      amount,
      status: normalizedStatus,
      client_id: clientId || null,
      job_id: jobId || null,
      geo_city: geoCityRaw || null,
      geo_postal: geoPostalRaw ? geoPostalRaw.toLowerCase() : null,
      job_type: row.job_type || undefined,
    });

    if (MEANINGFUL_ESTIMATE_STATUSES.includes(normalizedStatus)) {
      meaningful++;
    }
  }

  // Bulk insert
  if (normalized.length > 0) {
    const { error } = await supabase.from("estimates_normalized").insert(normalized);

    if (error) {
      throw new Error(`Failed to insert estimates: ${error.message}`);
    }
  }

  return {
    kept: normalized.length,
    rejected: rows.length - normalized.length,
    meaningful,
  };
}
