#!/usr/bin/env tsx

/**
 * Smoke test for repeat/geo bucket signals and MCP safety.
 *
 * Validates three things without hitting Supabase:
 * 1) normalizeAndStore writes client/geo fields (sanitized, non-PII)
 * 2) bucketEstimates produces repeat + geo distributions
 * 3) buildSafeBucketResponse returns aggregate-only payload (no raw rows)
 */

import { bucketEstimates } from "@/app/api/bucket/route";
import { normalizeAndStore } from "@/lib/ingest/normalize-estimates";
import type { CSVEstimateRow, EstimateNormalized } from "@/types/2ndlook";

import { buildSafeBucketResponse } from "../mcp-server/index";
import type { SourceStatus } from "../mcp-server/types";

async function main() {
  // Step 1: Normalize rows with client + geo context
  const now = new Date();
  const csvRows: CSVEstimateRow[] = [
    {
      estimate_id: "EST-1",
      created_at: now.toISOString(),
      closed_at: now.toISOString(),
      amount: "1200.00",
      status: "sent",
      job_type: "install",
      client_id: "  CLIENT-123  ",
      job_id: " JOB-9 ",
      geo_city: " Toronto ",
      geo_postal: "M5V 2T6",
    },
    {
      estimate_id: "EST-2",
      created_at: now.toISOString(),
      closed_at: now.toISOString(),
      amount: 700,
      status: "accepted",
      job_type: "install",
      client_id: "CLIENT-123",
      job_id: "JOB-10",
      geo_city: "toronto",
      geo_postal: "m5v-2t6",
    },
    {
      estimate_id: "EST-3",
      created_at: now.toISOString(),
      closed_at: now.toISOString(),
      amount: 950,
      status: "sent",
      job_type: "repair",
      client_id: "CLIENT-999",
      job_id: "JOB-11",
      geo_city: "San Francisco",
      geo_postal: "94107",
    },
  ];

  const inserted: Array<Omit<EstimateNormalized, "id">> = [];
  const supabaseMock = {
    from(table: string) {
      if (table !== "estimates_normalized") {
        throw new Error(`Unexpected table: ${table}`);
      }
      return {
        insert: async (rows: Array<Omit<EstimateNormalized, "id">>) => {
          inserted.push(...rows);
          return { error: null };
        },
      };
    },
  };

  const { kept, meaningful } = await normalizeAndStore(supabaseMock as unknown, "source-test", csvRows);

  if (kept !== csvRows.length) {
    throw new Error(`Expected ${csvRows.length} kept rows, got ${kept}`);
  }

  const first = inserted[0];
  if (first.client_id !== "CLIENT-123") throw new Error("client_id not normalized/trimmed");
  if (first.job_id !== "JOB-9") throw new Error("job_id not normalized/trimmed");
  if (first.geo_city !== "toronto") throw new Error("geo_city not lowercased");
  if (first.geo_postal !== "m5v2t6") throw new Error("geo_postal not sanitized");

  console.log("✅ normalizeAndStore captured client/geo fields");

  // Step 2: Bucket repeat + geo signals
  const buckets = bucketEstimates(
    inserted.map((row, idx) => ({
      ...row,
      id: `norm-${idx}`,
    })) as EstimateNormalized[],
  );

  if (buckets.unique_client_count !== 2) {
    throw new Error(`Unexpected unique_client_count: ${buckets.unique_client_count}`);
  }
  if (buckets.repeat_client_count !== 1) {
    throw new Error(`Unexpected repeat_client_count: ${buckets.repeat_client_count}`);
  }
  if (!buckets.geo_city_distribution?.[0] || buckets.geo_city_distribution[0].city !== "toronto") {
    throw new Error("geo_city_distribution missing expected top city");
  }
  if (!buckets.geo_postal_prefix_distribution?.some((p) => p.prefix === "m5v")) {
    throw new Error("geo_postal_prefix_distribution missing expected prefix");
  }

  console.log("✅ bucketEstimates produced repeat + geo aggregates");

  // Step 3: Ensure MCP projection is aggregate-only
  const safePayload = buildSafeBucketResponse({
    bucket: {
      ...buckets,
      id: "bucket-1",
      source_id: "source-test",
      created_at: now.toISOString(),
    } as Record<string, unknown>,
    sourceStatus: "bucketed" as SourceStatus,
    sourceId: "source-test",
    estimateCount: meaningful,
  });

  const forbiddenKeys = ["estimates", "rows", "estimate_id", "client", "geo_postal_full"];
  const hasForbiddenKey = Object.keys(safePayload).some((key) => forbiddenKeys.includes(key));
  if (hasForbiddenKey) {
    throw new Error("Safe payload contains unexpected raw keys");
  }

  if (!safePayload.geo_postal_prefix_distribution?.every((p: { prefix: string }) => p.prefix.length === 3)) {
    throw new Error("Postal prefixes not constrained to 3 characters");
  }

  console.log("✅ buildSafeBucketResponse returns aggregate-only payload");
  console.log("🎉 Smoke test passed.");
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
