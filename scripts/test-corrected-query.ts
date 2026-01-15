#!/usr/bin/env tsx

/**
 * Test the updated Jobber GraphQL query to verify it works with the correct schema
 */

import { createClient } from "@supabase/supabase-js";

import { createDecipheriv } from "node:crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JOBBER_GQL_VERSION = process.env.JOBBER_GQL_VERSION || "2025-04-16";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing environment variables");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function getKey(): Buffer {
  const base64Key = process.env.ENCRYPTION_KEY;
  if (!base64Key) throw new Error("ENCRYPTION_KEY is not set");
  return Buffer.from(base64Key, "base64");
}

function decrypt(ciphertext: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = ciphertext.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Invalid ciphertext format");

  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return plaintext.toString("utf8");
}

async function testCorrectedQuery() {
  console.log("\n✅ Testing CORRECTED Jobber Quote Query");
  console.log("======================================\n");

  const { data: connections } = await supabase.from("oauth_connections").select("*").eq("provider", "jobber").limit(1);

  if (!connections || connections.length === 0) {
    console.error("❌ No Jobber connection found");
    process.exit(1);
  }

  const accessToken = decrypt(connections[0].access_token_enc);
  console.log("✅ Got access token");
  console.log("📊 Version:", JOBBER_GQL_VERSION);
  console.log("\n🔥 Testing corrected production query...\n");

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const query = `
    query GetQuotes($after: ISO8601DateTime!) {
      quotes(
        filter: { createdAt: { after: $after } }
        first: 5
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

  const variables = {
    after: ninetyDaysAgo.toISOString(),
  };

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
  const data = await response.json();

  console.log("📋 Response Details:");
  console.log("   status:", response.status);
  console.log("   statusText:", response.statusText);
  console.log("   requestId:", requestId);

  if (data.errors) {
    console.log("\n❌ GraphQL Errors:");
    for (const err of data.errors) {
      console.log("   -", err.message);
    }
    console.log("\n📄 Full response:");
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (data.data?.quotes?.nodes) {
    const quotes = data.data.quotes.nodes;
    console.log("\n🎉 SUCCESS! Retrieved", quotes.length, "quotes\n");

    // Show first quote
    if (quotes.length > 0) {
      const q = quotes[0];
      console.log("📝 Sample Quote:");
      console.log("   id:", q.id);
      console.log("   createdAt:", q.createdAt);
      console.log("   updatedAt:", q.updatedAt);
      console.log("   quoteNumber:", q.quoteNumber);
      console.log("   quoteStatus:", q.quoteStatus, "✅");
      console.log("   sentAt:", q.sentAt);
      console.log("   amounts:", JSON.stringify(q.amounts), "✅");
      console.log("   client:", JSON.stringify(q.client));

      console.log("\n🎉 CONFIRMED:");
      console.log("   ✅ quoteStatus field works (was 'status')");
      console.log("   ✅ amounts.subtotal works (was 'total.amount')");
      console.log("   ✅ createdAt filter works (was 'createdAfter')");
      console.log("   ✅ ISO8601DateTime! type works (was 'DateTime!')");
    }

    // Show summary
    console.log("\n📊 Summary of all", quotes.length, "quotes:");
    for (const q of quotes) {
      console.log(
        `   #${q.quoteNumber} | status: ${q.quoteStatus} | $${q.amounts?.subtotal || 0} | ${q.client?.name || "no client"}`,
      );
    }
  }
}

testCorrectedQuery();
