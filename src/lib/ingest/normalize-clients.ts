/**
 * Normalization for Jobber clients ingestion.
 * Stores minimal identifiers only (no PII like names or emails).
 */

import type { ClientNormalized } from "@/types/2ndlook";
import { MAX_CLIENT_RECORDS, WINDOW_DAYS } from "@/lib/config/limits";

export interface ClientRowInput {
  client_id: string;
  created_at: string;
  updated_at?: string | null;
  is_lead?: boolean | null;
}

export interface NormalizeClientsResult {
  kept: number;
  rejected: number;
}

/**
 * Normalize and store clients in the database.
 * Enforces 90-day window (by created_at) and 100 record cap.
 */
export async function normalizeClientsAndStore(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  sourceId: string,
  rows: ClientRowInput[]
): Promise<NormalizeClientsResult> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - WINDOW_DAYS);

  const normalized: Omit<ClientNormalized, "id">[] = [];
  let rejected = 0;

  for (const row of rows) {
    const createdAt = new Date(row.created_at);
    const updatedAt = row.updated_at ? new Date(row.updated_at) : null;

    if (Number.isNaN(createdAt.getTime())) {
      rejected++;
      continue;
    }

    if (createdAt < cutoff) {
      rejected++;
      continue;
    }

    if (normalized.length >= MAX_CLIENT_RECORDS) {
      rejected++;
      continue;
    }

    normalized.push({
      client_id: row.client_id,
      source_id: sourceId,
      created_at: createdAt.toISOString(),
      updated_at: updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt.toISOString() : null,
      is_lead: row.is_lead ?? null,
    });
  }

  if (normalized.length > 0) {
    const { error } = await supabase.from("clients_normalized").insert(normalized);
    if (error) {
      throw new Error(`Failed to insert clients: ${error.message}`);
    }
  }

  return { kept: normalized.length, rejected };
}
