#!/usr/bin/env tsx

/**
 * Test script to verify Jobber GraphQL returns totals and statuses
 * with the production query structure including all fields.
 */

import { createClient } from "@supabase/supabase-js";

import { createDecipheriv } from "node:crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JOBBER_GQL_VERSION = process.env.JOBBER_GQL_VERSION || "2025-04-16";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing environment variables:");
  console.error("   NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function getKey(): Buffer {
  const base64Key = process.env.ENCRYPTION_KEY;
  if (!base64Key) throw new Error("ENCRYPTION_KEY is not set");
  return Buffer.from(base64Key, "base64");
}

function decrypt(ciphertext: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = ciphertext.split(":");

  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid ciphertext format");
  }

  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return plaintext.toString("utf8");
}

async function testFullQuery() {
  console.log("\n🧪 Testing Jobber GraphQL with FULL PRODUCTION QUERY");
  console.log("===================================================\n");

  const { data: connections, error } = await supabase
    .from("oauth_connections")
    .select("*")
    .eq("provider", "jobber")
    .limit(1);

  if (error || !connections || connections.length === 0) {
    console.error("❌ No Jobber OAuth connection found");
    process.exit(1);
  }

  const connection = connections[0];
  const accessToken = decrypt(connection.access_token_enc);

  console.log("✅ Found Jobber connection");
  console.log("📊 JOBBER_GQL_VERSION:", JOBBER_GQL_VERSION);
  console.log("\n🔥 Testing full query with all fields...\n");

  // Use the exact production query structure from graphql.ts
  const query = `
    query GetQuotes($dateFilter: DateTime!) {
      quotes(
        filter: { createdAfter: $dateFilter }
        first: 5
      ) {
        edges {
          node {
            id
            createdAt
            updatedAt
            closedAt
            status
            jobType
            total {
              amount
              currency
            }
            convertedAt
            approvedAt
          }
        }
      }
    }
  `;

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const variables = {
    dateFilter: ninetyDaysAgo.toISOString(),
  };

  try {
    const response = await fetch("https://api.getjobber.com/api/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-JOBBER-GRAPHQL-VERSION": JOBBER_GQL_VERSION,
      },
      body: JSON.stringify({ query, variables }),
    });

    const requestId = response.headers.get("x-request-id");
    const text = await response.text();
    const data = JSON.parse(text);

    console.log("📋 Response Details:");
    console.log("   status:", response.status);
    console.log("   statusText:", response.statusText);
    console.log("   requestId:", requestId);

    if (data.errors) {
      console.log("\n❌ GraphQL Errors:");
      for (const err of data.errors) {
        console.log("   -", err.message);
        if (err.path) console.log("     Path:", err.path.join("."));
      }
      console.log("\n📄 Full response:");
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    if (data.data?.quotes?.edges) {
      const quotes = data.data.quotes.edges;
      console.log("\n✅ SUCCESS! Retrieved", quotes.length, "quotes\n");

      // Show first quote to verify fields
      if (quotes.length > 0) {
        const firstQuote = quotes[0].node;
        console.log("📝 Sample Quote:");
        console.log("   id:", firstQuote.id);
        console.log("   createdAt:", firstQuote.createdAt);
        console.log("   updatedAt:", firstQuote.updatedAt);
        console.log("   closedAt:", firstQuote.closedAt);
        console.log("   status:", firstQuote.status, "✅");
        console.log("   jobType:", firstQuote.jobType);
        console.log("   total:", firstQuote.total, "✅");
        console.log("   convertedAt:", firstQuote.convertedAt);
        console.log("   approvedAt:", firstQuote.approvedAt);

        console.log("\n🎉 CONFIRMED: totals and statuses are returned!");
        console.log("   - total.amount:", firstQuote.total?.amount);
        console.log("   - total.currency:", firstQuote.total?.currency);
        console.log("   - status:", firstQuote.status);
      }

      // Show summary
      console.log("\n📊 Summary of all", quotes.length, "quotes:");
      for (const edge of quotes) {
        const q = edge.node;
        console.log(
          `   ${q.id.slice(-8)} | status: ${q.status || "null"} | total: ${q.total?.amount || "null"} ${q.total?.currency || ""} | jobType: ${q.jobType || "null"}`,
        );
      }
    }
  } catch (err) {
    console.error("\n❌ Request failed:", err);
    process.exit(1);
  }
}

testFullQuery();
