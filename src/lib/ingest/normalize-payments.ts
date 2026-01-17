/**
 * Shared normalization logic for payment ingestion.
 * Applies 90 day window, 100 record cap.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { MAX_PAYMENT_RECORDS, WINDOW_DAYS } from "@/lib/config/limits";
import type { PaymentNormalized } from "@/types/2ndlook";

export interface PaymentRowInput {
  payment_id: string;
  payment_date: string;
  payment_total: number | string;
  payment_type: string;
  invoice_id?: string | null;
  client_id?: string | null;
}

export interface NormalizePaymentsResult {
  kept: number;
  rejected: number;
}

/**
 * Normalize and store payment rows in the database.
 * Enforces: 90 day window (by payment_date) and max 100 records.
 */
export async function normalizePaymentsAndStore(
  supabase: SupabaseClient,
  sourceId: string,
  rows: PaymentRowInput[],
): Promise<NormalizePaymentsResult> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - WINDOW_DAYS);

  const normalized: Omit<PaymentNormalized, "id">[] = [];
  let rejected = 0;

  for (const row of rows) {
    const paymentDate = new Date(row.payment_date);
    if (Number.isNaN(paymentDate.getTime())) {
      rejected++;
      continue;
    }

    if (paymentDate < cutoff) {
      rejected++;
      continue;
    }

    const total = Number.parseFloat(String(row.payment_total).replace(/[^0-9.-]/g, ""));
    if (!Number.isFinite(total) || total < 0) {
      rejected++;
      continue;
    }

    if (normalized.length >= MAX_PAYMENT_RECORDS) {
      rejected++;
      continue;
    }

    normalized.push({
      payment_id: row.payment_id,
      source_id: sourceId,
      payment_date: paymentDate.toISOString(),
      payment_total: total,
      payment_type: row.payment_type,
      invoice_id: row.invoice_id ?? null,
      client_id: row.client_id ?? null,
      created_at: new Date().toISOString(),
    });
  }

  if (normalized.length > 0) {
    const { error } = await supabase.from("payments_normalized").insert(normalized);
    if (error) {
      throw new Error(`Failed to insert payments: ${error.message}`);
    }
  }

  return { kept: normalized.length, rejected };
}
