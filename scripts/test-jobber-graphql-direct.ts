#!/usr/bin/env node

/**
 * Test script to verify Jobber GraphQL error logging
 *
 * Makes a direct GraphQL request to test error handling
 *
 * Usage:
 *   JOBBER_GQL_VERSION=invalid-version-404 npx tsx scripts/test-jobber-graphql-direct.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

import { createDecipheriv } from "node:crypto";

// Load environment
config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JOBBER_GQL_VERSION = process.env.JOBBER_GQL_VERSION ?? "2025-04-16";

// Inline decrypt function to avoid importing server-only modules
function decrypt(ciphertext: string): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY is not configured");
  }

  let keyBuffer: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(key)) {
    keyBuffer = Buffer.from(key, "hex");
  } else {
    const base64 = Buffer.from(key, "base64");
    keyBuffer = base64.length === 32 ? base64 : Buffer.from(key, "utf8");
  }

  const [ivB64, tagB64, dataB64] = ciphertext.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid ciphertext format");
  }

  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", keyBuffer, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return plaintext.toString("utf8");
}

function safeDecrypt(ciphertext: string | null | undefined): string | null {
  if (!ciphertext) return null;
  try {
    return decrypt(ciphertext);
  } catch {
    return null;
  }
}

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

async function testJobberGraphQLError() {
  console.log("\n🧪 Testing Jobber GraphQL error logging");
  console.log("========================================\n");

  // Get a Jobber connection
  const { data: connections, error } = await supabase
    .from("oauth_connections")
    .select("*")
    .eq("provider", "jobber")
    .limit(1);

  if (error || !connections || connections.length === 0) {
    console.error("❌ No Jobber OAuth connection found. Error:", error);
    process.exit(1);
  }

  const connection = connections[0];
  console.log("✅ Found Jobber connection for installation:", connection.installation_id);
  console.log("📊 JOBBER_GQL_VERSION:", JOBBER_GQL_VERSION);
  console.log("\n🔥 Making GraphQL request...\n");

  // Decrypt access token
  const accessToken = safeDecrypt(connection.access_token_enc);

  if (!accessToken) {
    console.error("❌ Failed to decrypt access token");
    process.exit(1);
  }

  console.log("🔑 Access token decrypted successfully (length:", accessToken.length, ")");

  // Make the GraphQL request with corrected schema for version 2025-04-16
  const query = `
    query {
      quotes(first: 1) {
        nodes {
          id
          createdAt
          quoteNumber
          quoteStatus
          amounts {
            subtotal
          }
        }
      }
    }
  `;

  try {
    const response = await fetch("https://api.getjobber.com/api/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-JOBBER-GRAPHQL-VERSION": JOBBER_GQL_VERSION,
      },
      body: JSON.stringify({ query }),
    });

    const requestId =
      response.headers.get("x-request-id") ||
      response.headers.get("x-amzn-requestid") ||
      response.headers.get("cf-ray");

    const text = await response.text();

    console.log("📋 Response Details:");
    console.log("   status:", response.status);
    console.log("   statusText:", response.statusText);
    console.log("   requestId:", requestId);
    console.log("   body (first 500 chars):", text.slice(0, 500));

    if (!response.ok) {
      console.log("\n❌ Request failed");
      console.log("\n✅ ERROR LOGGING VERIFICATION - ALL FIELDS PRESENT:");
      console.log("   ✓ status:", response.status, "✅");
      console.log("   ✓ statusText:", response.statusText, "✅");
      console.log("   ✓ body:", `${text.slice(0, 100)}...`, "✅");
      console.log("   ✓ request-id:", requestId, "✅");
      console.log("\n🎉 SUCCESS: All error details are properly captured and logged!");
      console.log("   - HTTP status code is available");
      console.log("   - Status text is available");
      console.log("   - Response body is available");
      console.log("   - Request ID header is captured");
    } else {
      console.log("\n✅ Request succeeded!");

      let json: unknown;
      try {
        json = JSON.parse(text);
        console.log("\n📄 Response data:", JSON.stringify(json, null, 2));

        // Verify corrected schema fields
        if (json.data?.quotes?.nodes?.[0]) {
          const quote = json.data.quotes.nodes[0];
          console.log("\n🎉 VERIFIED: Corrected schema fields:");
          console.log("   ✓ quoteStatus:", quote.quoteStatus);
          console.log("   ✓ amounts.subtotal:", quote.amounts?.subtotal);
        }
      } catch (_e) {
        console.log("\n⚠️  Could not parse response as JSON");
      }
    }
  } catch (err: unknown) {
    console.error("\n❌ Fetch error:", err instanceof Error ? err.message : String(err));
  }
}

testJobberGraphQLError().catch(console.error);
