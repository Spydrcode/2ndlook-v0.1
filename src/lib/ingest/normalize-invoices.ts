/**
 * Shared normalization logic for invoice ingestion.
 * Applies 90 day window, 100 record cap, and canonical status mapping.
 */

import type { InvoiceNormalized } from "@/types/2ndlook";
import { MAX_INVOICE_RECORDS, WINDOW_DAYS } from "@/lib/config/limits";
import { normalizeInvoiceStatus } from "@/lib/ingest/statuses";

export interface InvoiceRowInput {
  invoice_id: string;
  invoice_date: string;
  invoice_total: number | string;
  invoice_status: string;
  linked_estimate_id?: string | null;
}

export interface NormalizeInvoicesResult {
  kept: number;
  rejected: number;
}

/**
 * Normalize and store invoice rows in the database.
 * Enforces: 90 day window (by invoice_date) and max 100 records.
 */
export async function normalizeInvoicesAndStore(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  sourceId: string,
  rows: InvoiceRowInput[]
): Promise<NormalizeInvoicesResult> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - WINDOW_DAYS);

  const normalized: Omit<InvoiceNormalized, "id">[] = [];
  let rejected = 0;

  for (const row of rows) {
    const invoiceDate = new Date(row.invoice_date);
    if (Number.isNaN(invoiceDate.getTime())) {
      rejected++;
      continue;
    }

    if (invoiceDate < cutoff) {
      rejected++;
      continue;
    }

    const total = Number.parseFloat(String(row.invoice_total).replace(/[^0-9.-]/g, ""));
    if (!Number.isFinite(total) || total < 0) {
      rejected++;
      continue;
    }

    if (normalized.length >= MAX_INVOICE_RECORDS) {
      rejected++;
      continue;
    }

    normalized.push({
      invoice_id: row.invoice_id,
      source_id: sourceId,
      invoice_date: invoiceDate.toISOString(),
      invoice_total: total,
      invoice_status: normalizeInvoiceStatus(row.invoice_status),
      linked_estimate_id: row.linked_estimate_id ?? null,
      created_at: new Date().toISOString(),
    });
  }

  if (normalized.length > 0) {
    const { error } = await supabase.from("invoices_normalized").insert(normalized);
    if (error) {
      throw new Error(`Failed to insert invoices: ${error.message}`);
    }
  }

  return { kept: normalized.length, rejected };
}
