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
import { JobberMissingScopesError } from "@/lib/jobber/errors";
import { fetchClientsPaged, fetchInvoicesPaged, fetchJobsPaged, fetchQuotesPaged } from "@/lib/jobber/graphql";

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

    let invoicesResult: { rows: any[]; totalCost: number } = { rows: [], totalCost: 0 };
    let jobsResult: { rows: any[]; totalCost: number } = { rows: [], totalCost: 0 };
    let clientsResult: { rows: any[]; totalCost: number } = { rows: [], totalCost: 0 };
    let missingScopes: string[] = [];

    try {
      invoicesResult = await fetchInvoicesPaged({
        installationId: args.oauth_connection_id,
        sinceISO,
        limit: args.limits.max_invoices ?? 25,
        targetMaxCost: 6000,
      });
    } catch (err) {
      if (err instanceof JobberMissingScopesError) {
        missingScopes = [...missingScopes, ...err.missing];
        console.warn("[JOBBER] Missing scopes for invoices; continuing without invoices:", err);
        invoicesResult = { rows: [], totalCost: 0 };
      } else {
        throw err;
      }
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
        missingScopes = [...missingScopes, ...err.missing];
        console.warn("[JOBBER] Missing scopes for jobs; continuing without jobs:", err);
        jobsResult = { rows: [], totalCost: 0 };
      } else {
        throw err;
      }
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
        missingScopes = [...missingScopes, ...err.missing];
        console.warn("[JOBBER] Missing scopes for clients; continuing without clients:", err);
        clientsResult = { rows: [], totalCost: 0 };
      } else {
        throw err;
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
