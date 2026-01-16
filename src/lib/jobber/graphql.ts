import { WINDOW_DAYS } from "@/lib/config/limits";
import type { ClientRowInput } from "@/lib/ingest/normalize-clients";
import type { InvoiceRowInput } from "@/lib/ingest/normalize-invoices";
import type { JobRowInput } from "@/lib/ingest/normalize-jobs";
import { normalizeEstimateStatus } from "@/lib/ingest/statuses";
import type { CSVEstimateRow } from "@/types/2ndlook";

import { getJobberAccessToken } from "./oauth";

const JOBBER_GQL_VERSION = process.env.JOBBER_GQL_VERSION ?? "2025-04-16";

export interface JobberQuote {
  id: string;
  createdAt: string;
  updatedAt?: string | null;
  quoteNumber?: string | null;
  quoteStatus?: string | null;
  amounts?: { subtotal?: number | null } | null;
  client?: { id?: string | null; name?: string | null } | null;
  sentAt?: string | null;
}

interface JobberInvoice {
  id: string;
  createdAt: string;
  issuedDate?: string | null;
  dueDate?: string | null;
  invoiceStatus: string;
  amounts?: { total?: { amount?: string | number | null } | null } | null;
  jobs?: { nodes?: Array<{ id: string }> } | null;
  client?: { id?: string };
}

interface JobberJob {
  id: string;
  createdAt: string;
  startAt?: string | null;
  endAt?: string | null;
  jobStatus?: string | null;
  total?: number | string | null;
  client?: { id?: string | null } | null;
}

interface JobberClient {
  id: string;
  createdAt: string;
  updatedAt?: string | null;
  isLead?: boolean | null;
}

export class JobberGraphQLError extends Error {
  status?: number;
  statusText?: string;
  requestId?: string | null;
  graphqlErrors?: unknown;
  responseText?: string;

  constructor(message: string, init?: Partial<JobberGraphQLError>) {
    super(message);
    this.name = "JobberGraphQLError";
    Object.assign(this, init);
  }
}

async function jobberGraphQLRequest<T>({
  installationId,
  query,
  variables,
}: {
  installationId: string;
  query: string;
  variables?: Record<string, unknown>;
}): Promise<T> {
  console.log("[JOBBER GRAPHQL] Getting access token for installation:", installationId);
  const accessToken = await getJobberAccessToken(installationId);
  if (!accessToken) {
    console.error("[JOBBER GRAPHQL] Failed to get access token");
    throw new Error("Failed to get Jobber access token");
  }

  const response = await fetch("https://api.getjobber.com/api/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "X-JOBBER-GRAPHQL-VERSION": JOBBER_GQL_VERSION,
    },
    body: JSON.stringify({
      query,
      variables: variables ?? {},
    }),
  });

  const requestId =
    response.headers.get("x-request-id") || response.headers.get("x-amzn-requestid") || response.headers.get("cf-ray");
  const text = await response.text();
  let json: { data?: T; errors?: unknown };
  try {
    json = JSON.parse(text);
  } catch (err) {
    console.error("[JOBBER GRAPHQL] Failed to parse JSON response:", err, text);
    throw new Error("Jobber API returned non-JSON response");
  }

  if (!response.ok) {
    console.error("[JOBBER GRAPHQL] Non-OK response", {
      status: response.status,
      statusText: response.statusText,
      requestId,
      body: text?.slice(0, 2000),
    });
    throw new JobberGraphQLError(
      `Jobber API error: ${response.status} ${response.statusText} :: ${text?.slice(0, 200)}`,
      {
        status: response.status,
        statusText: response.statusText,
        requestId,
        responseText: text,
      },
    );
  }

  if (json.errors) {
    console.error("[JOBBER GRAPHQL] GraphQL errors:", JSON.stringify(json.errors, null, 2), {
      status: response.status,
      requestId,
      responseText: text,
    });
    throw new JobberGraphQLError("Jobber GraphQL returned errors", {
      status: response.status,
      statusText: response.statusText,
      requestId,
      graphqlErrors: json.errors,
      responseText: text,
    });
  }

  if (!json.data) {
    throw new Error("Jobber API returned empty data");
  }

  return json.data;
}

/**
 * Fetch quotes (estimates) from Jobber GraphQL API
 *
 * Returns data in CSVEstimateRow format for compatibility with shared normalization.
 * Field diet enforced: only id, dates, total, status
 * Filters: last 90 days, limit 100 records
 */
export async function fetchEstimates(installationId: string): Promise<CSVEstimateRow[]> {
  try {
    // Calculate window start
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - WINDOW_DAYS);
    const iso = ninetyDaysAgo.toISOString();

    // Use corrected Jobber GraphQL schema for version 2025-04-16
    const query = `
      query GetQuotes($after: ISO8601DateTime!) {
        quotes(
          filter: { createdAt: { after: $after } }
          first: 100
        ) {
          nodes {
            id
            createdAt
            updatedAt
            quoteNumber
            quoteStatus
            sentAt
            amounts {
              subtotal
            }
            client {
              id
              name
            }
          }
        }
      }
    `;

    const variables = { after: iso };

    console.log(`[JOBBER GRAPHQL] Fetching quotes with version ${JOBBER_GQL_VERSION}...`);
    const result = await jobberGraphQLRequest<{ quotes: { nodes: JobberQuote[] } }>({
      installationId,
      query,
      variables,
    });

    const quotes = result.quotes.nodes || [];

    console.log("[JOBBER RAW RESPONSE] Total quotes found:", quotes.length);
    if (quotes.length > 0) {
      console.log("[JOBBER RAW RESPONSE] First quote sample:", JSON.stringify(quotes[0], null, 2));
    }

    // Map to CSVEstimateRow format
    const estimateRows: CSVEstimateRow[] = quotes
      .filter((quote) => {
        const createdDate = new Date(quote.createdAt);
        return createdDate >= ninetyDaysAgo;
      })
      .slice(0, 100)
      .map((quote) => {
        // Use amounts.subtotal instead of total.amount
        const amountRaw = quote.amounts?.subtotal ?? 0;
        const parsedAmount = typeof amountRaw === "string" ? parseFloat(amountRaw) : Number(amountRaw);
        const normalizedAmount = Number.isFinite(parsedAmount) ? parsedAmount : 0;

        // Use quoteStatus instead of status
        const normalizedStatus = normalizeJobberStatus(quote.quoteStatus ?? "unknown");

        // Use sentAt as a proxy for when quote became active
        const closedAt = quote.sentAt || null;
        const updatedAt = quote.updatedAt || closedAt || quote.createdAt;

        return {
          estimate_id: quote.id,
          created_at: quote.createdAt,
          updated_at: updatedAt || quote.createdAt,
          closed_at: closedAt,
          amount: normalizedAmount,
          status: normalizedStatus,
          client_id: quote.client?.id ?? null,
          job_type: undefined, // Not available in this schema version
        };
      });

    console.log("[JOBBER GRAPHQL] After filtering - estimateRows count:", estimateRows.length);
    if (estimateRows.length > 0) {
      console.log("[JOBBER GRAPHQL] First normalized estimate:", JSON.stringify(estimateRows[0], null, 2));
    }
    console.log("[JOBBER GRAPHQL] Returning estimates to caller");

    return estimateRows;
  } catch (error) {
    console.error("[JOBBER GRAPHQL] Exception caught:", error);
    console.error("[JOBBER GRAPHQL] Error stack:", error instanceof Error ? error.stack : "No stack");
    throw error;
  }
}

/**
 * Normalize Jobber quote status to 2ndlook canonical status
 */
function normalizeJobberStatus(status: string): string {
  return normalizeEstimateStatus(status);
}

/**
 * Fetch invoices from Jobber GraphQL API.
 * Returns rows ready for invoice normalization.
 */
export async function fetchInvoices(installationId: string): Promise<InvoiceRowInput[]> {
  const query = `
    query GetInvoices {
      invoices(first: 100) {
        nodes {
          id
          createdAt
          issuedDate
          dueDate
          invoiceStatus
          amounts {
            total {
              amount
            }
          }
          jobs {
            nodes { id }
          }
          client {
            id
          }
        }
      }
    }
  `;

  console.log("[JOBBER GRAPHQL] Fetching invoices from Jobber API...");
  const result = await jobberGraphQLRequest<{ invoices?: { nodes?: JobberInvoice[] } }>({
    installationId,
    query,
  });

  const invoices = result.invoices?.nodes ?? [];

  console.log(`[JOBBER GRAPHQL] Invoices returned: ${invoices.length}`);
  if (invoices.length > 0) {
    console.log("[JOBBER GRAPHQL] First invoice sample:", JSON.stringify(invoices[0], null, 2));
  }

  const rows: InvoiceRowInput[] = invoices.map((invoice) => ({
    invoice_id: invoice.id,
    invoice_date: invoice.issuedDate || invoice.createdAt || invoice.dueDate || new Date().toISOString(),
    invoice_total:
      invoice.amounts?.total?.amount !== undefined && invoice.amounts?.total?.amount !== null
        ? invoice.amounts.total.amount
        : 0,
    invoice_status: invoice.invoiceStatus,
    linked_estimate_id: invoice.jobs?.nodes?.[0]?.id ?? null,
  }));

  return rows;
}

/**
 * Fetch jobs from Jobber GraphQL API.
 */
export async function fetchJobs(installationId: string): Promise<JobRowInput[]> {
  const query = `
    query GetJobs {
      jobs(first: 100) {
        nodes {
          id
          createdAt
          startAt
          endAt
          jobStatus
          total
          client { id }
        }
      }
    }
  `;

  console.log("[JOBBER GRAPHQL] Fetching jobs from Jobber API...");
  const result = await jobberGraphQLRequest<{ jobs?: { nodes?: JobberJob[] } }>({
    installationId,
    query,
  });

  const jobs = result.jobs?.nodes ?? [];
  console.log(`[JOBBER GRAPHQL] Jobs returned: ${jobs.length}`);

  if (jobs.length > 0) {
    console.log("[JOBBER GRAPHQL] First job sample:", JSON.stringify(jobs[0], null, 2));
  }

  const rows: JobRowInput[] = jobs.map((job) => ({
    job_id: job.id,
    created_at: job.createdAt,
    start_at: job.startAt ?? null,
    end_at: job.endAt ?? null,
    job_status: job.jobStatus ?? undefined,
    job_total: job.total ?? null,
    client_id: job.client?.id ?? null,
  }));

  return rows;
}

/**
 * Fetch clients from Jobber GraphQL API.
 */
export async function fetchClients(installationId: string): Promise<ClientRowInput[]> {
  const query = `
    query GetClients {
      clients(first: 100) {
        nodes {
          id
          createdAt
          updatedAt
          isLead
        }
      }
    }
  `;

  console.log("[JOBBER GRAPHQL] Fetching clients from Jobber API...");
  const result = await jobberGraphQLRequest<{ clients?: { nodes?: JobberClient[] } }>({
    installationId,
    query,
  });

  const clients = result.clients?.nodes ?? [];
  console.log(`[JOBBER GRAPHQL] Clients returned: ${clients.length}`);

  if (clients.length > 0) {
    console.log("[JOBBER GRAPHQL] First client sample:", JSON.stringify(clients[0], null, 2));
  }

  const rows: ClientRowInput[] = clients.map((client) => ({
    client_id: client.id,
    created_at: client.createdAt,
    updated_at: client.updatedAt ?? null,
    is_lead: client.isLead ?? null,
  }));

  return rows;
}
