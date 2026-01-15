#!/usr/bin/env tsx

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

async function discoverAmounts() {
  console.log("\n💰 Discovering Quote Amounts/Money Fields");
  console.log("=========================================\n");

  const { data: connections } = await supabase.from("oauth_connections").select("*").eq("provider", "jobber").limit(1);

  if (!connections || connections.length === 0) {
    console.error("❌ No Jobber connection found");
    process.exit(1);
  }

  const accessToken = decrypt(connections[0].access_token_enc);
  console.log("✅ Got access token\n");

  // Test amounts as scalar
  console.log("1️⃣ Testing: amounts { subtotal }");
  await testQuery(accessToken, `query { quotes(first: 1) { nodes { id amounts { subtotal } } } }`);

  // Test line items
  console.log("\n2️⃣ Testing: lineItems { edges { node { total } } }");
  await testQuery(accessToken, `query { quotes(first: 1) { nodes { id lineItems { edges { node { total } } } } } }`);

  // Test jobs relation
  console.log("\n3️⃣ Testing: jobs { nodes { id } }");
  await testQuery(accessToken, `query { quotes(first: 1) { nodes { id jobs { nodes { id } } } } }`);

  // Test quoteStatus
  console.log("\n4️⃣ Testing: quoteStatus");
  await testQuery(accessToken, `query { quotes(first: 1) { nodes { id quoteStatus } } }`);

  // Test all money/amount variations
  console.log("\n5️⃣ Testing: lineItems with pricing subfields");
  await testQuery(
    accessToken,
    `query { quotes(first: 1) { nodes { id lineItems { edges { node { id description quantity unitCost total } } } } } }`,
  );

  // Test client with more fields
  console.log("\n6️⃣ Testing: client with more fields");
  await testQuery(accessToken, `query { quotes(first: 1) { nodes { id client { id name companyName } } } }`);
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
    console.log("   ✅ SUCCESS!");
    console.log(JSON.stringify(data.data, null, 2));
  }
}

discoverAmounts();
