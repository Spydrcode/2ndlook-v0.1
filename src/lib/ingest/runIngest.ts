import type { SupabaseClient } from "@supabase/supabase-js";

import { MIN_MEANINGFUL_ESTIMATES_PROD } from "@/lib/config/limits";
import { sanitizeCity, sanitizeMoney, sanitizePostal } from "@/lib/connectors/sanitize";
import type { ConnectorPayload } from "@/lib/connectors/types";
import { normalizeClientsAndStore } from "@/lib/ingest/normalize-clients";
import { normalizeAndStore } from "@/lib/ingest/normalize-estimates";
import { normalizeInvoicesAndStore } from "@/lib/ingest/normalize-invoices";
import { normalizeJobsAndStore } from "@/lib/ingest/normalize-jobs";
import { normalizePaymentsAndStore } from "@/lib/ingest/normalize-payments";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CSVEstimateRow } from "@/types/2ndlook";

export interface RunIngestOptions {
  sourceId?: string;
  sourceName?: string;
  supabase?: SupabaseClient; // Allow stubbing in tests
}

export interface RunIngestResult {
  source_id: string;
  kept: number;
  rejected: number;
  meaningful: number;
  invoices_kept: number;
  jobs_kept: number;
  clients_kept: number;
  payments_kept: number;
}

/**
 * Run ingest from a canonical connector payload into normalized tables.
 * Creates a source when one is not provided.
 */
export async function runIngestFromPayload(
  payload: ConnectorPayload,
  installationId: string,
  options: RunIngestOptions = {},
): Promise<RunIngestResult> {
  const supabase = options.supabase ?? createAdminClient();

  let sourceId = options.sourceId;
  const createdSource = !sourceId;

  if (!sourceId) {
    const sourceType = payload.kind === "file" ? "csv" : payload.kind;
    const { data: source, error: sourceError } = await supabase
      .from("sources")
      .insert({
        installation_id: installationId,
        source_type: sourceType,
        source_name: options.sourceName ?? `Ingested via ${payload.kind}`,
        status: "pending",
      })
      .select("id")
      .single();

    if (sourceError || !source) {
      throw new Error(`Failed to create source: ${sourceError?.message || "unknown error"}`);
    }

    sourceId = source.id;
  }

  try {
    const finalSourceId = sourceId as string;

    const estimateRows: CSVEstimateRow[] = (payload.estimates || []).map((estimate) => ({
      estimate_id: estimate.estimate_id,
      created_at: estimate.created_at,
      updated_at: estimate.updated_at ?? null,
      closed_at: estimate.closed_at ?? null,
      amount: sanitizeMoney(estimate.amount),
      status: estimate.status,
      job_type: estimate.job_type ?? undefined,
      client_id: estimate.client_id ?? null,
      job_id: estimate.job_id ?? null,
      geo_city: sanitizeCity(estimate.geo_city ?? null),
      geo_postal: sanitizePostal(estimate.geo_postal ?? null),
    }));

    const invoiceRows = (payload.invoices || []).map((invoice) => ({
      invoice_id: invoice.invoice_id,
      invoice_date: invoice.created_at,
      invoice_total: sanitizeMoney(invoice.amount),
      invoice_status: invoice.paid ? "paid" : "unknown",
      linked_estimate_id: null,
    }));

    const clientRows = (payload.clients || []).map((client) => ({
      client_id: client.client_id,
      created_at: client.created_at ?? payload.generated_at,
      updated_at: null,
      is_lead: null,
    }));

    const jobRows = (payload.jobs || []).map((job) => ({
      job_id: job.job_id,
      created_at: job.created_at ?? payload.generated_at,
      start_at: job.created_at ?? null,
      end_at: job.completed_at ?? null,
      job_status: job.job_status ?? job.job_type ?? null,
      job_total: null,
      client_id: job.client_id ?? null,
    }));

    const paymentRows = (payload.payments || []).map((payment) => ({
      payment_id: payment.payment_id,
      payment_date: payment.created_at,
      payment_total: sanitizeMoney(payment.amount),
      payment_type: payment.payment_type ?? "unknown",
      invoice_id: payment.invoice_id ?? null,
      client_id: payment.client_id ?? null,
    }));

    const { kept, rejected, meaningful } = await normalizeAndStore(supabase, finalSourceId, estimateRows);
    const { kept: invoices_kept } = await normalizeInvoicesAndStore(supabase, finalSourceId, invoiceRows);
    const { kept: jobs_kept } = await normalizeJobsAndStore(supabase, finalSourceId, jobRows);
    const { kept: clients_kept } = await normalizeClientsAndStore(supabase, finalSourceId, clientRows);
    const { kept: payments_kept } = await normalizePaymentsAndStore(supabase, finalSourceId, paymentRows);

    await supabase
      .from("sources")
      .update({
        status: "ingested",
        metadata: {
          meaningful_estimates: meaningful,
          required_min: MIN_MEANINGFUL_ESTIMATES_PROD,
          totals: {
            estimates: kept,
            invoices: invoices_kept,
            jobs: jobs_kept,
            clients: clients_kept,
            payments: payments_kept,
          },
        },
      })
      .eq("id", finalSourceId);

    return {
      source_id: finalSourceId,
      kept,
      rejected,
      meaningful,
      invoices_kept,
      jobs_kept,
      clients_kept,
      payments_kept,
    };
  } catch (error) {
    if (createdSource) {
      await supabase.from("sources").delete().eq("id", sourceId);
    }
    throw error;
  }
}
