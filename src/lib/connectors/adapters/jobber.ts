import { WINDOW_DAYS } from "@/lib/config/limits";
import { sanitizeCity, sanitizeMoney, sanitizePostal } from "@/lib/connectors/sanitize";
import type {
  CanonicalClient,
  CanonicalEstimate,
  CanonicalInvoice,
  CanonicalJob,
  ConnectorAdapter,
  ConnectorPayload,
} from "@/lib/connectors/types";
import { fetchClients, fetchEstimates, fetchInvoices, fetchJobs } from "@/lib/jobber/graphql";

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

    const [estimateRows, invoiceRows, jobRows, clientRows] = await Promise.all([
      fetchEstimates(args.oauth_connection_id),
      fetchInvoices(args.oauth_connection_id),
      fetchJobs(args.oauth_connection_id),
      fetchClients(args.oauth_connection_id),
    ]);

    const estimates: CanonicalEstimate[] = (estimateRows || []).map((row) => ({
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

    const invoices: CanonicalInvoice[] = (invoiceRows || []).map((row) => ({
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

    const jobs: CanonicalJob[] = (jobRows || []).map((row) => ({
      job_id: row.job_id,
      created_at: row.created_at ?? null,
      completed_at: row.end_at ?? null,
      client_id: row.client_id ?? null,
      geo_city: null,
      geo_postal: null,
      job_type: row.job_status ?? null,
      job_status: row.job_status ?? null,
    }));

    const clients: CanonicalClient[] = (clientRows || []).map((row) => ({
      client_id: row.client_id,
      created_at: row.created_at ?? null,
      geo_city: null,
      geo_postal: null,
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
    };
  },
};
