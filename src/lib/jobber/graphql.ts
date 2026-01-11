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
  try {
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

    // Try edges { node } structure first (most common in GraphQL pagination)
    const query = `
      query GetQuotes($dateFilter: Date!) {
        quotes(
          filter: { createdAfter: $dateFilter }
          first: 100
        ) {
          edges {
            node {
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
      }
    `;

    console.log("[JOBBER GRAPHQL] Fetching from Jobber API...");
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
    
    // === RAW RESPONSE DEBUG LOGGING ===
    console.log("[JOBBER RAW RESPONSE] Status:", response.status);
    console.log("[JOBBER RAW RESPONSE] Full JSON:", JSON.stringify(result, null, 2));
    console.log("[JOBBER RAW RESPONSE] Has errors?", !!result.errors);
    console.log("[JOBBER RAW RESPONSE] data.quotes exists?", !!result.data?.quotes);
    console.log("[JOBBER RAW RESPONSE] data.quotes structure:", Object.keys(result.data?.quotes || {}));
    // === END DEBUG LOGGING ===

    if (result.errors) {
      console.error("[JOBBER GRAPHQL] GraphQL errors:", JSON.stringify(result.errors, null, 2));
      throw new Error("GraphQL query failed: " + JSON.stringify(result.errors));
    }

    // Try both edges.node and nodes structures
    let quotes: JobberQuote[] = [];
    if (result.data?.quotes?.edges) {
      console.log("[JOBBER RAW RESPONSE] Using edges.node structure");
      quotes = result.data.quotes.edges.map((edge: any) => edge.node);
    } else if (result.data?.quotes?.nodes) {
      console.log("[JOBBER RAW RESPONSE] Using nodes structure");
      quotes = result.data.quotes.nodes;
    } else {
      console.log("[JOBBER RAW RESPONSE] No quotes found in response");
    }
    
    console.log("[JOBBER RAW RESPONSE] Total quotes found:", quotes.length);
    if (quotes.length > 0) {
      console.log("[JOBBER RAW RESPONSE] First quote sample:", JSON.stringify(quotes[0], null, 2));
    }

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
  const statusLower = status.toLowerCase();
  
  // Map Jobber statuses to canonical closed/accepted
  if (statusLower === "approved" || statusLower === "converted") {
    return "accepted";
  }
  
  return "closed";
}
