import { WINDOW_DAYS } from "@/lib/config/limits";
import { sanitizeCity, sanitizeMoney, sanitizePostal } from "@/lib/connectors/sanitize";
import type {
  CanonicalClient,
  CanonicalEstimate,
  CanonicalInvoice,
  CanonicalJob,
  CanonicalPayment,
  ConnectorAdapter,
  ConnectorPayload,
} from "@/lib/connectors/types";
import type { ClientRowInput } from "@/lib/ingest/normalize-clients";
import type { InvoiceRowInput } from "@/lib/ingest/normalize-invoices";
import type { JobRowInput } from "@/lib/ingest/normalize-jobs";
import type { PaymentRowInput } from "@/lib/ingest/normalize-payments";
import { JobberMissingScopesError } from "@/lib/jobber/errors";
import {
  fetchClientsPaged,
  fetchInvoicesPaged,
  fetchJobsPaged,
  fetchPaymentsPaged,
  fetchQuotesPaged,
} from "@/lib/jobber/graphql";

/**
 * Jobber adapter: maps Jobber GraphQL outputs to canonical connector payload.
 */
export const jobberAdapter: ConnectorAdapter = {
  kind: "jobber",
  async fetchPayload(args: {
    oauth_connection_id: string;
    window_days: number;
    limits: ConnectorPayload["limits"];
  }): Promise<ConnectorPayload> {
    const windowDays = args.window_days || WINDOW_DAYS;
    const since = new Date();
    since.setDate(since.getDate() - windowDays);
    const sinceISO = since.toISOString();

    const quotesResult = await fetchQuotesPaged({
      installationId: args.oauth_connection_id,
      sinceISO,
      limit: args.limits.max_estimates ?? 25,
      targetMaxCost: 6000,
    });

    let invoicesResult: { rows: InvoiceRowInput[]; totalCost?: number } = { rows: [], totalCost: 0 };
    let jobsResult: { rows: JobRowInput[]; totalCost?: number } = { rows: [], totalCost: 0 };
    let clientsResult: { rows: ClientRowInput[]; totalCost?: number } = { rows: [], totalCost: 0 };
    let paymentsResult: { rows: PaymentRowInput[]; totalCost?: number } = { rows: [], totalCost: 0 };
    try {
      invoicesResult = await fetchInvoicesPaged({
        installationId: args.oauth_connection_id,
        sinceISO,
        limit: args.limits.max_invoices ?? 25,
        targetMaxCost: 6000,
      });
    } catch (err) {
      if (err instanceof JobberMissingScopesError) {
        console.warn("[JOBBER] Missing scopes for invoices; reauth required:", err);
      }
      throw err;
    }

    try {
      jobsResult = await fetchJobsPaged({
        installationId: args.oauth_connection_id,
        sinceISO,
        limit: args.limits.max_jobs ?? 25,
        targetMaxCost: 6000,
      });
    } catch (err) {
      if (err instanceof JobberMissingScopesError) {
        console.warn("[JOBBER] Missing scopes for jobs; reauth required:", err);
      }
      throw err;
    }

    try {
      clientsResult = await fetchClientsPaged({
        installationId: args.oauth_connection_id,
        sinceISO,
        limit: args.limits.max_clients ?? 25,
        targetMaxCost: 6000,
      });
    } catch (err) {
      if (err instanceof JobberMissingScopesError) {
        console.warn("[JOBBER] Missing scopes for clients; reauth required:", err);
      }
      throw err;
    }

    if ((args.limits.max_payments ?? 0) > 0) {
      try {
        paymentsResult = await fetchPaymentsPaged({
          installationId: args.oauth_connection_id,
          sinceISO,
          limit: args.limits.max_payments ?? 25,
          targetMaxCost: 6000,
        });
      } catch (err) {
        if (err instanceof JobberMissingScopesError) {
          console.warn("[JOBBER] Missing scopes for payments; continuing without payments:", err);
          paymentsResult = { rows: [], totalCost: 0 };
        } else {
          throw err;
        }
      }
    }

    const estimates: CanonicalEstimate[] = (quotesResult.rows || []).map((row) => ({
      estimate_id: row.estimate_id,
      created_at: row.created_at,
      updated_at: row.updated_at ?? null,
      closed_at: row.closed_at ?? null,
      status: row.status,
      amount: sanitizeMoney(row.amount),
      currency: null,
      client_id: row.client_id ?? null,
      job_id: row.job_id ?? null,
      geo_city: sanitizeCity(row.geo_city ?? null),
      geo_postal: sanitizePostal(row.geo_postal ?? null),
      job_type: row.job_type ?? null,
    }));

    const invoices: CanonicalInvoice[] = (invoicesResult.rows || []).map((row) => ({
      invoice_id: row.invoice_id,
      created_at: row.invoice_date,
      paid: row.invoice_status?.toLowerCase?.() === "paid",
      paid_at: null,
      amount: sanitizeMoney(row.invoice_total),
      currency: null,
      client_id: null,
      geo_city: null,
      geo_postal: null,
    }));

    const jobs: CanonicalJob[] = (jobsResult.rows || []).map((row) => ({
      job_id: row.job_id,
      created_at: row.created_at ?? null,
      completed_at: row.end_at ?? null,
      client_id: row.client_id ?? null,
      geo_city: null,
      geo_postal: null,
      job_type: row.job_status ?? null,
      job_status: row.job_status ?? null,
    }));

    const clients: CanonicalClient[] = (clientsResult.rows || []).map(
      (row: {
        client_id: string;
        created_at?: string | null;
        geo_city?: string | null;
        geo_postal?: string | null;
      }) => ({
        client_id: row.client_id,
        created_at: row.created_at ?? null,
        geo_city: sanitizeCity(row.geo_city ?? null),
        geo_postal: sanitizePostal(row.geo_postal ?? null),
      }),
    );

    const payments: CanonicalPayment[] = (paymentsResult.rows || []).map((row) => ({
      payment_id: row.payment_id,
      created_at: row.payment_date,
      amount: sanitizeMoney(row.payment_total),
      currency: null,
      payment_type: row.payment_type ?? null,
      invoice_id: row.invoice_id ?? null,
      client_id: row.client_id ?? null,
    }));

    return {
      kind: "jobber",
      generated_at: new Date().toISOString(),
      window_days: windowDays,
      limits: args.limits,
      clients,
      estimates,
      invoices,
      jobs,
      payments,
    };
  },
};
