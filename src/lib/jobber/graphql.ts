import { getJobberAccessToken } from "./oauth";
import type { CSVEstimateRow } from "@/types/2ndlook";

export interface JobberQuote {
  id: string;
  createdAt: string;
  closedAt: string | null;
  total: { amount: string; currency: string };
  status: string;
}

/**
 * Fetch closed/accepted quotes (estimates) from Jobber GraphQL API
 * 
 * Returns data in CSVEstimateRow format for compatibility with shared normalization.
 * Field diet enforced: only id, dates, total, status
 * Filters: last 90 days, limit 100 records, closed/accepted status only
 */
export async function fetchClosedEstimates(
  installationId: string
): Promise<CSVEstimateRow[]> {
  console.log("[JOBBER GRAPHQL] Getting access token for installation:", installationId);
  const accessToken = await getJobberAccessToken(installationId);
  if (!accessToken) {
    console.error("[JOBBER GRAPHQL] Failed to get access token");
    throw new Error("Failed to get Jobber access token");
  }
  console.log("[JOBBER GRAPHQL] Got access token, fetching quotes...");

  // Calculate 90 days ago
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const dateFilter = ninetyDaysAgo.toISOString().split("T")[0];

  const query = `
    query GetQuotes($dateFilter: Date!) {
      quotes(
        filter: { createdAfter: $dateFilter }
        first: 100
      ) {
        nodes {
          id
          createdAt
          closedAt
          total {
            amount
            currency
          }
          status
        }
      }
    }
  `;

  const response = await fetch("https://api.getjobber.com/api/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "X-JOBBER-GRAPHQL-VERSION": "2023-03-09",
    },
    body: JSON.stringify({
      query,
      variables: { dateFilter },
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error("[JOBBER GRAPHQL] API error:", response.status, errorData);
    throw new Error(`Jobber API error: ${response.status} - ${errorData}`);
  }
  console.log("[JOBBER GRAPHQL] Response OK, parsing data...");

  const result = await response.json();

  if (result.errors) {
    console.error("GraphQL errors:", result.errors);
    throw new Error("GraphQL query failed");
  }

  const quotes = (result.data?.quotes?.nodes || []) as JobberQuote[];

  // Map to CSVEstimateRow format and filter for closed/accepted
  const estimateRows: CSVEstimateRow[] = quotes
    .filter((quote) => {
      // Only include if closedAt exists (must be closed)
      if (!quote.closedAt) return false;
      
      // Map Jobber status to our canonical status
      const status = normalizeJobberStatus(quote.status);
      return status === "closed" || status === "accepted";
    })
    .map((quote) => ({
      estimate_id: quote.id,
      created_at: quote.createdAt,
      closed_at: quote.closedAt as string, // Non-null after filter
      amount: quote.total.amount,
      status: normalizeJobberStatus(quote.status),
      job_type: undefined, // Jobber doesn't provide job_type in field diet
    }));

  return estimateRows;
}

/**
 * Normalize Jobber quote status to 2ndlook canonical status
 */
function normalizeJobberStatus(status: string): string {
  const statusLower = status.toLowerCase();
  
  // Map Jobber statuses to canonical closed/accepted
  if (statusLower === "approved" || statusLower === "converted") {
    return "accepted";
  }
  
  return "closed";
}
