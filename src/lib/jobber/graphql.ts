import { sanitizeCity, sanitizePostal } from "@/lib/connectors/sanitize";
import type { ClientRowInput } from "@/lib/ingest/normalize-clients";
import type { InvoiceRowInput } from "@/lib/ingest/normalize-invoices";
import type { JobRowInput } from "@/lib/ingest/normalize-jobs";
import type { PaymentRowInput } from "@/lib/ingest/normalize-payments";
import { normalizeEstimateStatus } from "@/lib/ingest/statuses";
import type { CSVEstimateRow } from "@/types/2ndlook";

import { JobberAPIError, JobberMissingScopesError } from "./errors";
import { jobberGraphQL } from "./graphqlClient";
import { getJobberAccessToken } from "./oauth";

const DEFAULT_PAGE_SIZE = 25;
const TARGET_MAX_COST = 6000;
const MAX_RECORDS = 100;
const MAX_PAGES = 10;

type PageArgs = {
  installationId: string;
  sinceISO: string;
  limit?: number;
  maxPages?: number;
  targetMaxCost?: number;
};

function adjustPageSize(current: number, requested?: number, maxCost?: number, target?: number, minSize = 5): number {
  if (!requested || !maxCost) return current;
  const targetCost = target ?? TARGET_MAX_COST;
  if (requested <= targetCost) return current;
  const scaled = Math.floor((current * targetCost) / requested);
  return Math.max(minSize, scaled);
}

export async function fetchQuotesPaged(args: PageArgs): Promise<{
  rows: CSVEstimateRow[];
  totalCost?: number;
}> {
  const accessToken = await getJobberAccessToken(args.installationId);
  if (!accessToken) {
    throw new JobberMissingScopesError("Missing Jobber access token");
  }

  let after: string | null = null;
  const rows: CSVEstimateRow[] = [];
  const maxRecords = Math.min(args.limit ?? MAX_RECORDS, MAX_RECORDS);
  let pageSize = Math.min(args.limit ?? DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  let pages = 0;
  let totalCost = 0;

  while (rows.length < maxRecords && pages < (args.maxPages ?? MAX_PAGES)) {
    const queryWithLinks = `
      query GetQuotes($after: String, $first: Int!, $since: ISO8601DateTime!) {
        quotes(
          first: $first
          after: $after
          filter: { updatedAt: { after: $since } }
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            createdAt
            updatedAt
            quoteStatus
            sentAt
            amounts { subtotal }
            client { id }
            jobs { nodes { id } }
          }
        }
      }
    `;

    const queryMinimal = `
      query GetQuotesMinimal($after: String, $first: Int!, $since: ISO8601DateTime!) {
        quotes(
          first: $first
          after: $after
          filter: { updatedAt: { after: $since } }
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            createdAt
            updatedAt
            quoteStatus
            sentAt
            amounts { subtotal }
          }
        }
      }
    `;

    let quoteResult: {
      data: {
        quotes: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: Array<{
            id: string;
            createdAt: string;
            updatedAt?: string | null;
            quoteStatus?: string | null;
            sentAt?: string | null;
            amounts?: { subtotal?: number | string | null } | null;
            client?: { id?: string | null } | null;
            jobs?: { nodes?: Array<{ id?: string | null }> | null } | null;
          }>;
        };
      };
      cost?: { requested: number; max: number; available?: number };
    } | null = null;

    try {
      quoteResult = await jobberGraphQL<{
        quotes: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: Array<{
            id: string;
            createdAt: string;
            updatedAt?: string | null;
            quoteStatus?: string | null;
            sentAt?: string | null;
            amounts?: { subtotal?: number | string | null } | null;
            client?: { id?: string | null } | null;
            jobs?: { nodes?: Array<{ id?: string | null }> | null } | null;
          }>;
        };
      }>(queryWithLinks, { after, first: pageSize, since: args.sinceISO }, accessToken, {
        targetMaxCost: args.targetMaxCost ?? TARGET_MAX_COST,
      });
    } catch (err) {
      // If missing scopes for client/job links, retry without them.
      if (err instanceof JobberMissingScopesError) {
        console.warn("[JOBBER] Missing scopes for quote links; retrying quotes without client/job fields.");
        quoteResult = await jobberGraphQL<{
          quotes: {
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
            nodes: Array<{
              id: string;
              createdAt: string;
              updatedAt?: string | null;
              quoteStatus?: string | null;
              sentAt?: string | null;
              amounts?: { subtotal?: number | string | null } | null;
            }>;
          };
        }>(queryMinimal, { after, first: pageSize, since: args.sinceISO }, accessToken, {
          targetMaxCost: args.targetMaxCost ?? TARGET_MAX_COST,
        });
      } else if (err instanceof JobberAPIError && err.message.includes("jobs")) {
        console.warn("[JOBBER] Quote jobs field unavailable; retrying quotes without job links.");
        quoteResult = await jobberGraphQL<{
          quotes: {
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
            nodes: Array<{
              id: string;
              createdAt: string;
              updatedAt?: string | null;
              quoteStatus?: string | null;
              sentAt?: string | null;
              amounts?: { subtotal?: number | string | null } | null;
              client?: { id?: string | null } | null;
            }>;
          };
        }>(
          `
          query GetQuotesNoJobs($after: String, $first: Int!, $since: ISO8601DateTime!) {
            quotes(
              first: $first
              after: $after
              filter: { updatedAt: { after: $since } }
            ) {
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                id
                createdAt
                updatedAt
                quoteStatus
                sentAt
                amounts { subtotal }
                client { id }
              }
            }
          }
        `,
          { after, first: pageSize, since: args.sinceISO },
          accessToken,
          {
            targetMaxCost: args.targetMaxCost ?? TARGET_MAX_COST,
          },
        );
      } else {
        throw err;
      }
    }

    if (!quoteResult) break;

    const {
      data,
      cost,
    }: {
      data: {
        quotes: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: Array<{
            id: string;
            createdAt: string;
            updatedAt?: string | null;
            quoteStatus?: string | null;
            sentAt?: string | null;
            amounts?: { subtotal?: number | string | null } | null;
            client?: { id?: string | null } | null;
            jobs?: { nodes?: Array<{ id?: string | null }> | null } | null;
          }>;
        };
      };
      cost?: { requested: number; max: number; available?: number };
    } = quoteResult;

    if (cost) {
      totalCost += cost.requested ?? 0;
      pageSize = adjustPageSize(pageSize, cost.requested, cost.max, args.targetMaxCost);
    }

    const nodes = data.quotes.nodes || [];
    const mapped = nodes.map(
      (quote: {
        id: string;
        createdAt: string;
        updatedAt?: string | null;
        quoteStatus?: string | null;
        sentAt?: string | null;
        amounts?: { subtotal?: number | string | null } | null;
        client?: { id?: string | null } | null;
        jobs?: { nodes?: Array<{ id?: string | null }> | null } | null;
      }) => {
        const amountRaw = quote.amounts?.subtotal ?? 0;
        const parsedAmount = typeof amountRaw === "string" ? parseFloat(amountRaw) : Number(amountRaw);
        const normalizedAmount = Number.isFinite(parsedAmount) ? parsedAmount : 0;
        const normalizedStatus = normalizeEstimateStatus(quote.quoteStatus ?? "unknown");
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
          job_id: quote.jobs?.nodes?.[0]?.id ?? null,
          geo_city: null,
          geo_postal: null,
        };
      },
    );

    rows.push(...mapped);
    pages += 1;

    if (!data.quotes.pageInfo.hasNextPage || rows.length >= maxRecords) {
      break;
    }
    after = data.quotes.pageInfo.endCursor;
  }

  return { rows: rows.slice(0, maxRecords), totalCost };
}

export async function fetchInvoicesPaged(args: PageArgs): Promise<{ rows: InvoiceRowInput[]; totalCost?: number }> {
  const accessToken = await getJobberAccessToken(args.installationId);
  if (!accessToken) {
    throw new JobberMissingScopesError("Missing Jobber access token");
  }

  let after: string | null = null;
  const rows: InvoiceRowInput[] = [];
  const maxRecords = Math.min(args.limit ?? MAX_RECORDS, MAX_RECORDS);
  let pageSize = Math.min(args.limit ?? DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  let pages = 0;
  let totalCost = 0;

  while (rows.length < maxRecords && pages < (args.maxPages ?? MAX_PAGES)) {
    const query = `
      query GetInvoices($after: String, $first: Int!, $since: ISO8601DateTime!) {
        invoices(
          first: $first
          after: $after
          filter: { updatedAt: { after: $since } }
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            createdAt
            updatedAt
            invoiceStatus
            amounts { total }
            client { id }
          }
        }
      }
    `;

    const invoiceResult: {
      data: {
        invoices: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: Array<{
            id: string;
            createdAt: string;
            updatedAt?: string | null;
            invoiceStatus: string;
            amounts?: { total?: number | string | null } | null;
            client?: { id?: string | null } | null;
          }>;
        };
      };
      cost?: { requested: number; max: number; available?: number };
    } = await jobberGraphQL<{
      invoices: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Array<{
          id: string;
          createdAt: string;
          updatedAt?: string | null;
          invoiceStatus: string;
          amounts?: { total?: number | string | null } | null;
          client?: { id?: string | null } | null;
        }>;
      };
    }>(query, { after, first: pageSize, since: args.sinceISO }, accessToken, {
      targetMaxCost: args.targetMaxCost ?? TARGET_MAX_COST,
    });

    const { data, cost } = invoiceResult;

    if (cost) {
      totalCost += cost.requested ?? 0;
      pageSize = adjustPageSize(pageSize, cost.requested, cost.max, args.targetMaxCost);
    }

    const nodes = data.invoices.nodes || [];
    const mapped = nodes.map(
      (invoice: {
        id: string;
        createdAt: string;
        updatedAt?: string | null;
        invoiceStatus: string;
        amounts?: { total?: number | string | null } | null;
        client?: { id?: string | null } | null;
      }) => ({
        invoice_id: invoice.id,
        invoice_date: invoice.updatedAt || invoice.createdAt,
        invoice_total:
          invoice.amounts?.total !== undefined && invoice.amounts?.total !== null ? invoice.amounts.total : 0,
        invoice_status: invoice.invoiceStatus,
        linked_estimate_id: null,
      }),
    );

    rows.push(...mapped);
    pages += 1;
    if (!data.invoices.pageInfo.hasNextPage || rows.length >= maxRecords) break;
    after = data.invoices.pageInfo.endCursor;
  }

  return { rows: rows.slice(0, maxRecords), totalCost };
}

export async function fetchJobsPaged(args: PageArgs): Promise<{ rows: JobRowInput[]; totalCost?: number }> {
  const accessToken = await getJobberAccessToken(args.installationId);
  if (!accessToken) {
    throw new JobberMissingScopesError("Missing Jobber access token");
  }

  let after: string | null = null;
  const rows: JobRowInput[] = [];
  const maxRecords = Math.min(args.limit ?? MAX_RECORDS, MAX_RECORDS);
  let pageSize = Math.min(args.limit ?? DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  let pages = 0;
  let totalCost = 0;

  while (rows.length < maxRecords && pages < (args.maxPages ?? MAX_PAGES)) {
    const query = `
      query GetJobs($after: String, $first: Int!) {
        jobs(
          first: $first
          after: $after
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
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

    if (process.env.NODE_ENV !== "production") {
      const forbiddenFilterFields = ["updatedAt"];
      for (const field of forbiddenFilterFields) {
        if (query.includes(field)) {
          throw new JobberAPIError(`Jobs query includes forbidden filter field: ${field}`);
        }
      }
    }

    const { data, cost } = (await jobberGraphQL<{
      jobs: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Array<{
          id: string;
          createdAt: string;
          startAt?: string | null;
          endAt?: string | null;
          jobStatus?: string | null;
          total?: number | string | null;
          client?: { id?: string | null } | null;
        }>;
      };
    }>(query, { after, first: pageSize }, accessToken, {
      targetMaxCost: args.targetMaxCost ?? TARGET_MAX_COST,
    })) as {
      data: {
        jobs: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: Array<{
            id: string;
            createdAt: string;
            startAt?: string | null;
            endAt?: string | null;
            jobStatus?: string | null;
            total?: number | string | null;
            client?: { id?: string | null } | null;
          }>;
        };
      };
      cost?: { requested: number; max: number; available?: number };
    };

    if (cost) {
      totalCost += cost.requested ?? 0;
      pageSize = adjustPageSize(pageSize, cost.requested, cost.max, args.targetMaxCost);
    }

    const cutoff = new Date(args.sinceISO);
    const nodes = (data.jobs.nodes || []).filter((job) => {
      const createdAt = new Date(job.createdAt);
      if (Number.isNaN(createdAt.getTime())) return false;
      return createdAt >= cutoff;
    });
    const mapped = nodes.map(
      (job: {
        id: string;
        createdAt: string;
        startAt?: string | null;
        endAt?: string | null;
        jobStatus?: string | null;
        total?: number | string | null;
        client?: { id?: string | null } | null;
      }) => ({
        job_id: job.id,
        created_at: job.createdAt,
        start_at: job.startAt ?? null,
        end_at: job.endAt ?? null,
        job_status: job.jobStatus ?? undefined,
        job_total: job.total ?? null,
        client_id: job.client?.id ?? null,
      }),
    );

    rows.push(...mapped);
    pages += 1;
    if (!data.jobs.pageInfo.hasNextPage || rows.length >= maxRecords) break;
    after = data.jobs.pageInfo.endCursor;
  }

  return { rows: rows.slice(0, maxRecords), totalCost };
}

export async function fetchClientsPaged(args: PageArgs): Promise<{ rows: ClientRowInput[]; totalCost?: number }> {
  const accessToken = await getJobberAccessToken(args.installationId);
  if (!accessToken) {
    throw new JobberMissingScopesError("Missing Jobber access token");
  }

  let after: string | null = null;
  const rows: ClientRowInput[] = [];
  const maxRecords = Math.min(args.limit ?? MAX_RECORDS, MAX_RECORDS);
  let pageSize = Math.min(args.limit ?? DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  let pages = 0;
  let totalCost = 0;

  while (rows.length < maxRecords && pages < (args.maxPages ?? MAX_PAGES)) {
    const queryWithAddress = `
      query GetClients($after: String, $first: Int!, $since: ISO8601DateTime!) {
        clients(
          first: $first
          after: $after
          filter: { updatedAt: { after: $since } }
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            createdAt
            updatedAt
            isLead
            billingAddress {
              city
              postalCode
            }
          }
        }
      }
    `;

    const queryWithoutAddress = `
      query GetClientsNoAddress($after: String, $first: Int!, $since: ISO8601DateTime!) {
        clients(
          first: $first
          after: $after
          filter: { updatedAt: { after: $since } }
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            createdAt
            updatedAt
            isLead
          }
        }
      }
    `;

    let clientResult: {
      data: {
        clients: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: Array<{
            id: string;
            createdAt: string;
            updatedAt?: string | null;
            isLead?: boolean | null;
            billingAddress?: { city?: string | null; postalCode?: string | null } | null;
          }>;
        };
      };
      cost?: { requested: number; max: number; available?: number };
    } | null = null;

    try {
      clientResult = await jobberGraphQL<{
        clients: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: Array<{
            id: string;
            createdAt: string;
            updatedAt?: string | null;
            isLead?: boolean | null;
            addresses?: Array<{ city?: string | null; postalCode?: string | null }> | null;
          }>;
        };
      }>(queryWithAddress, { after, first: pageSize, since: args.sinceISO }, accessToken, {
        targetMaxCost: args.targetMaxCost ?? TARGET_MAX_COST,
      });
    } catch (err) {
      // If scopes are too narrow for addresses, retry without address fields.
      if (
        err instanceof JobberMissingScopesError ||
        (err instanceof JobberAPIError && err.message.toLowerCase().includes("billingaddress"))
      ) {
        console.warn("[JOBBER] Address fields unavailable; retrying clients without address fields.");
        clientResult = await jobberGraphQL<{
          clients: {
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
            nodes: Array<{
              id: string;
              createdAt: string;
              updatedAt?: string | null;
              isLead?: boolean | null;
            }>;
          };
        }>(queryWithoutAddress, { after, first: pageSize, since: args.sinceISO }, accessToken, {
          targetMaxCost: args.targetMaxCost ?? TARGET_MAX_COST,
        });
      } else {
        throw err;
      }
    }

    if (!clientResult) break;
    const {
      data,
      cost,
    }: {
      data: {
        clients: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: Array<{
            id: string;
            createdAt: string;
            updatedAt?: string | null;
            isLead?: boolean | null;
            billingAddress?: { city?: string | null; postalCode?: string | null } | null;
          }>;
        };
      };
      cost?: { requested: number; max: number; available?: number };
    } = clientResult;

    if (cost) {
      totalCost += cost.requested ?? 0;
      pageSize = adjustPageSize(pageSize, cost.requested, cost.max, args.targetMaxCost);
    }

    const nodes = data.clients.nodes || [];
    const mapped = nodes.map(
      (client: {
        id: string;
        createdAt: string;
        updatedAt?: string | null;
        isLead?: boolean | null;
        billingAddress?: { city?: string | null; postalCode?: string | null } | null;
      }) => {
        const city = client.billingAddress?.city ? sanitizeCity(client.billingAddress.city) : null;
        const postal = client.billingAddress?.postalCode ? sanitizePostal(client.billingAddress.postalCode) : null;
        return {
          client_id: client.id,
          created_at: client.createdAt,
          updated_at: client.updatedAt ?? null,
          is_lead: client.isLead ?? null,
          geo_city: city,
          geo_postal: postal,
        };
      },
    );

    rows.push(...mapped);
    pages += 1;
    if (!data.clients.pageInfo.hasNextPage || rows.length >= maxRecords) break;
    after = data.clients.pageInfo.endCursor;
  }

  return { rows: rows.slice(0, maxRecords), totalCost };
}

export async function fetchPaymentsPaged(args: PageArgs): Promise<{ rows: PaymentRowInput[]; totalCost?: number }> {
  const accessToken = await getJobberAccessToken(args.installationId);
  if (!accessToken) {
    throw new JobberMissingScopesError("Missing Jobber access token");
  }

  let after: string | null = null;
  const rows: PaymentRowInput[] = [];
  const maxRecords = Math.min(args.limit ?? MAX_RECORDS, MAX_RECORDS);
  let pageSize = Math.min(args.limit ?? DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  let pages = 0;
  let totalCost = 0;

  while (rows.length < maxRecords && pages < (args.maxPages ?? MAX_PAGES)) {
    const query = `
      query GetPaymentRecords($after: String, $first: Int!, $since: ISO8601DateTime!) {
        paymentRecords(
          first: $first
          after: $after
          filter: { entryDate: { after: $since }, paymentType: JOBBER_PAYMENTS }
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            entryDate
            amount
            paymentType
            invoice { id }
            client { id }
          }
        }
      }
    `;

    const paymentResult: {
      data: {
        paymentRecords: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: Array<{
            id: string;
            entryDate: string;
            amount: number | string;
            paymentType?: string | null;
            invoice?: { id?: string | null } | null;
            client?: { id?: string | null } | null;
          }>;
        };
      };
      cost?: { requested: number; max: number; available?: number };
    } = await jobberGraphQL<{
      paymentRecords: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Array<{
          id: string;
          entryDate: string;
          amount: number | string;
          paymentType?: string | null;
          invoice?: { id?: string | null } | null;
          client?: { id?: string | null } | null;
        }>;
      };
    }>(query, { after, first: pageSize, since: args.sinceISO }, accessToken, {
      targetMaxCost: args.targetMaxCost ?? TARGET_MAX_COST,
    });

    const { data, cost } = paymentResult;

    if (cost) {
      totalCost += cost.requested ?? 0;
      pageSize = adjustPageSize(pageSize, cost.requested, cost.max, args.targetMaxCost);
    }

    const nodes = data.paymentRecords.nodes || [];
    const mapped = nodes.map(
      (payment: {
        id: string;
        entryDate: string;
        amount: number | string;
        paymentType?: string | null;
        invoice?: { id?: string | null } | null;
        client?: { id?: string | null } | null;
      }) => ({
        payment_id: payment.id,
        payment_date: payment.entryDate,
        payment_total: payment.amount,
        payment_type: payment.paymentType ?? "unknown",
        invoice_id: payment.invoice?.id ?? null,
        client_id: payment.client?.id ?? null,
      }),
    );

    rows.push(...mapped);
    pages += 1;
    if (!data.paymentRecords.pageInfo.hasNextPage || rows.length >= maxRecords) break;
    after = data.paymentRecords.pageInfo.endCursor;
  }

  return { rows: rows.slice(0, maxRecords), totalCost };
}

export async function appDisconnectJobber(accessToken: string): Promise<{
  userErrors: Array<{ message?: string | null }> | null;
}> {
  const mutation = `
    mutation DisconnectApp {
      appDisconnect {
        app { name author }
        userErrors { message }
      }
    }
  `;

  const result = await jobberGraphQL<{
    appDisconnect: { userErrors: Array<{ message?: string | null }> };
  }>(mutation, {}, accessToken);

  return { userErrors: result.data.appDisconnect.userErrors ?? null };
}
