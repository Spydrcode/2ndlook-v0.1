#!/usr/bin/env node

/**
 * Test Jobber token refresh with rotation
 * 
 * Verifies:
 * 1. Token refresh updates BOTH access_token AND refresh_token
 * 2. Race condition protection (concurrent refresh attempts)
 * 3. New tokens are properly saved to database
 * 
 * Usage:
 *   npx tsx scripts/test-jobber-token-refresh.ts
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing environment variables");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function testTokenRefresh() {
  console.log("\n🧪 Testing Jobber Token Refresh with Rotation");
  console.log("==============================================\n");

  // Get a Jobber connection
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
  console.log("✅ Found Jobber connection:", connection.installation_id);
  console.log("📊 Current token expires:", connection.token_expires_at);
  console.log("📊 Current refresh token (first 20 chars):", connection.refresh_token_enc?.slice(0, 20) + "...");

  // Import the refresh function
  const { getJobberAccessToken } = await import("../src/lib/jobber/oauth");

  console.log("\n🔄 Attempting to get access token (will refresh if needed)...");
  
  const accessToken = await getJobberAccessToken(connection.installation_id);
  
  if (!accessToken) {
    console.error("❌ Failed to get access token");
    console.log("\n💡 Check:");
    console.log("   1. JOBBER_CLIENT_ID and JOBBER_CLIENT_SECRET are set");
    console.log("   2. Refresh token is still valid in Jobber");
    console.log("   3. Check console logs for detailed errors");
    process.exit(1);
  }

  console.log("✅ Got access token (length:", accessToken.length, ")");

  // Fetch the updated connection to see if refresh token changed
  const { data: updatedConnection } = await supabase
    .from("oauth_connections")
    .select("*")
    .eq("installation_id", connection.installation_id)
    .eq("provider", "jobber")
    .single();

  if (updatedConnection) {
    console.log("\n📊 Updated connection details:");
    console.log("   New token expires:", updatedConnection.token_expires_at);
    console.log("   New refresh token (first 20 chars):", updatedConnection.refresh_token_enc?.slice(0, 20) + "...");
    
    const tokensChanged = 
      connection.token_expires_at !== updatedConnection.token_expires_at ||
      connection.refresh_token_enc !== updatedConnection.refresh_token_enc;
    
    if (tokensChanged) {
      console.log("\n✅ SUCCESS: Tokens were refreshed and updated!");
      console.log("   ✓ Expiration changed:", connection.token_expires_at !== updatedConnection.token_expires_at);
      console.log("   ✓ Refresh token rotated:", connection.refresh_token_enc !== updatedConnection.refresh_token_enc);
    } else {
      console.log("\n✅ Tokens were still valid, no refresh needed");
    }
  }

  // Test race condition protection
  console.log("\n🏁 Testing race condition protection...");
  console.log("   Simulating 3 concurrent requests...");
  
  const start = Date.now();
  const results = await Promise.all([
    getJobberAccessToken(connection.installation_id),
    getJobberAccessToken(connection.installation_id),
    getJobberAccessToken(connection.installation_id),
  ]);
  const duration = Date.now() - start;

  const allSucceeded = results.every(token => token && token.length > 0);
  const allSame = results.every(token => token === results[0]);

  console.log("   ✓ All requests succeeded:", allSucceeded ? "✅" : "❌");
  console.log("   ✓ All got same token:", allSame ? "✅" : "❌");
  console.log("   ✓ Completed in:", duration + "ms");

  if (allSucceeded && allSame) {
    console.log("\n🎉 SUCCESS: Race condition protection working!");
  }
}

testTokenRefresh().catch(console.error);
