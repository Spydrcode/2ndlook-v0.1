#!/usr/bin/env tsx

/**
 * Smoke test to validate connector payload ingestion is tool-agnostic.
 * - Builds a canonical payload (file + jobber kinds) with the same rows
 * - Runs runIngestFromPayload into a mocked Supabase client
 * - Buckets normalized rows and ensures schemas match
 * - Asserts no PII-like fields (street/address/email/phone) leak into payloads
 */

import { bucketEstimates } from "@/app/api/bucket/route";
import { sanitizeCity, sanitizePostal } from "@/lib/connectors/sanitize";
import type { ConnectorPayload } from "@/lib/connectors/types";
import { runIngestFromPayload } from "@/lib/ingest/runIngest";
import type { EstimateNormalized } from "@/types/2ndlook";

type TableStore = Record<string, unknown[]>;

function createMockSupabase(db: TableStore) {
  return {
    from(table: string) {
      db[table] ??= [];
      return {
        insert: (rows: unknown) => {
          const incoming = Array.isArray(rows) ? rows : [rows];
          const inserted = incoming.map((row, idx) => ({
            ...row,
            id: row.id ?? `${table}-${db[table].length + idx + 1}`,
          }));
          db[table].push(...inserted);
          return {
            data: inserted,
            error: null,
            select() {
              return this;
            },
            single: async () => ({ data: inserted[0], error: null }),
          };
        },
        update: (data: unknown) => ({
          eq: async (_col: string, value: string) => {
            db[table] = db[table].map((row) => (row.id === value ? { ...row, ...data } : row));
            return { data: null, error: null };
          },
        }),
        delete: () => ({
          eq: async (_col: string, value: string) => {
            db[table] = db[table].filter((row) => row.id !== value);
            return { data: null, error: null };
          },
        }),
        select: () => ({
          single: async () => ({ data: db[table][0] ?? null, error: null }),
        }),
        eq: () => ({ single: async () => ({ data: db[table][0] ?? null, error: null }) }),
      };
    },
  };
}

function assertNoPII(payload: ConnectorPayload) {
  const serialized = JSON.stringify(payload).toLowerCase();
  const forbidden = ["street", "address1", "address_1", "email", "phone"];
  if (forbidden.some((key) => serialized.includes(key))) {
    throw new Error("Payload contains PII-like fields");
  }
}

async function main() {
  const now = new Date().toISOString();
  const baseEstimates = [
    {
      estimate_id: "E-1",
      created_at: now,
      closed_at: now,
      status: "sent",
      amount: 750,
      client_id: "C-1",
      job_id: "J-1",
      geo_city: sanitizeCity("Toronto"),
      geo_postal: sanitizePostal("M5V2T6"),
    },
    {
      estimate_id: "E-2",
      created_at: now,
      closed_at: now,
      status: "accepted",
      amount: 1800,
      client_id: "C-1",
      job_id: "J-2",
      geo_city: sanitizeCity("Toronto"),
      geo_postal: sanitizePostal("M5V 2T6"),
    },
  ];

  const limits = { max_estimates: 100, max_invoices: 0, max_clients: 0, max_jobs: 0 };

  const filePayload: ConnectorPayload = {
    kind: "file",
    generated_at: now,
    window_days: 90,
    limits,
    clients: [],
    invoices: [],
    jobs: [],
    estimates: baseEstimates,
  };

  const jobberPayload: ConnectorPayload = { ...filePayload, kind: "jobber" };

  assertNoPII(filePayload);
  assertNoPII(jobberPayload);

  const db: TableStore = {};
  const supabase = createMockSupabase(db);

  const fileResult = await runIngestFromPayload(filePayload, "install-mock", {
    sourceName: "File Smoke",
    supabase,
  });
  const jobberResult = await runIngestFromPayload(jobberPayload, "install-mock", {
    sourceName: "Jobber Smoke",
    supabase,
  });

  const fileEstimates = (db.estimates_normalized || []).filter((e) => e.source_id === fileResult.source_id) as
    | EstimateNormalized[]
    | [];
  const jobberEstimates = (db.estimates_normalized || []).filter(
    (e) => e.source_id === jobberResult.source_id,
  ) as EstimateNormalized[];

  const fileBuckets = bucketEstimates(fileEstimates);
  const jobberBuckets = bucketEstimates(jobberEstimates);

  if (fileBuckets.price_band_500_1500 !== jobberBuckets.price_band_500_1500) {
    throw new Error("Bucketed outputs differ between connectors");
  }

  if (!fileBuckets.geo_postal_prefix_distribution?.length || !jobberBuckets.geo_postal_prefix_distribution?.length) {
    throw new Error("Geo postal prefix distribution missing");
  }

  console.log("✅ Connector payload ingest is tool-agnostic.");
  console.log("   File source:", fileResult.source_id, "Jobber source:", jobberResult.source_id);
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
