#!/usr/bin/env tsx

/**
 * Discover what fields are actually available on Jobber Quote type
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

async function discoverSchema() {
  console.log("\n🔍 Discovering Jobber Quote Schema");
  console.log("===================================\n");

  const { data: connections, error } = await supabase
    .from("oauth_connections")
    .select("*")
    .eq("provider", "jobber")
    .limit(1);

  if (error || !connections || connections.length === 0) {
    console.error("❌ No Jobber connection found");
    process.exit(1);
  }

  const accessToken = decrypt(connections[0].access_token_enc);
  console.log("✅ Got access token");
  console.log("📊 Version:", JOBBER_GQL_VERSION);
  console.log("\n📝 Testing various field combinations...\n");

  // Test 1: Minimal fields
  console.log("1️⃣ Testing: id, createdAt");
  await testQuery(
    accessToken,
    `
    query { quotes(first: 1) { nodes { id createdAt } } }
  `,
  );

  // Test 2: Common fields
  console.log("\n2️⃣ Testing: id, createdAt, updatedAt, quoteNumber");
  await testQuery(
    accessToken,
    `
    query { quotes(first: 1) { nodes { id createdAt updatedAt quoteNumber } } }
  `,
  );

  // Test 3: Test with job relation
  console.log("\n3️⃣ Testing: id, createdAt, job { id, title }");
  await testQuery(
    accessToken,
    `
    query { quotes(first: 1) { nodes { id createdAt job { id title } } } }
  `,
  );

  // Test 4: Test with client relation
  console.log("\n4️⃣ Testing: id, createdAt, client { id, name }");
  await testQuery(
    accessToken,
    `
    query { quotes(first: 1) { nodes { id createdAt client { id name } } } }
  `,
  );

  // Test 5: Test amounts/pricing
  console.log("\n5️⃣ Testing: id, createdAt, amounts { subtotal { amount currency } }");
  await testQuery(
    accessToken,
    `
    query { quotes(first: 1) { nodes { id createdAt amounts { subtotal { amount currency } } } } }
  `,
  );

  // Test 6: Test lifecycle fields
  console.log("\n6️⃣ Testing: id, createdAt, sentAt, acceptedAt");
  await testQuery(
    accessToken,
    `
    query { quotes(first: 1) { nodes { id createdAt sentAt acceptedAt } } }
  `,
  );

  // Test 7: Test with createdAt filter (DateRange?)
  console.log("\n7️⃣ Testing: createdAt filter with DateRange");
  await testQuery(
    accessToken,
    `
    query($after: ISO8601DateTime!) {
      quotes(filter: { createdAt: { after: $after } }, first: 1) {
        nodes { id createdAt }
      }
    }
  `,
    { after: "2025-01-01T00:00:00Z" },
  );
}

async function testQuery(accessToken: string, query: string, variables?: Record<string, unknown>) {
  const response = await fetch("https://api.getjobber.com/api/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "X-JOBBER-GRAPHQL-VERSION": JOBBER_GQL_VERSION,
    },
    body: JSON.stringify({ query, variables }),
  });

  const data = await response.json();

  if (data.errors) {
    console.log("   ❌ ERRORS:");
    for (const err of data.errors) {
      console.log("      -", err.message);
    }
  } else if (data.data) {
    console.log("   ✅ SUCCESS! Sample data:");
    console.log("     ", JSON.stringify(data.data, null, 2).split("\n").slice(0, 10).join("\n      "));
  }
}

discoverSchema();
