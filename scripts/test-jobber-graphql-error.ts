#!/usr/bin/env node

/**
 * Test script to verify Jobber GraphQL error logging
 * 
 * Tests that error responses include:
 * - status / statusText
 * - body (responseText)
 * - request-id header
 * 
 * Usage:
 *   JOBBER_GQL_VERSION=invalid-version npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/test-jobber-graphql-error.ts
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Load environment
config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing environment variables:");
  console.error("   NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function testJobberGraphQLError() {
  console.log("\n🧪 Testing Jobber GraphQL error logging");
  console.log("========================================\n");

  // First, let's check what tables exist
  console.log("🔍 Checking database schema...");
  
  // Try to get any oauth connection (don't filter by tool yet)
  const { data: allConnections, error: allError } = await supabase
    .from("oauth_connections")
    .select("*")
    .limit(5);

  if (allError) {
    console.error("❌ Error querying oauth_connections:", allError);
    console.log("\n💡 Your database may need migrations applied.");
    console.log("   Run: npx supabase db push");
    process.exit(1);
  }

  console.log("📊 Found", allConnections?.length || 0, "OAuth connections");
  if (allConnections && allConnections.length > 0) {
    console.log("   Schema:", Object.keys(allConnections[0]));
    console.log("   Connections:", allConnections.map((c: any) => `${c.provider} (${c.installation_id})`));
  }

  // Now find a Jobber connection (check both 'tool' and 'provider' fields)
  const jobberConnection = allConnections?.find((c: any) => 
    c.tool === 'jobber' || c.provider === 'jobber'
  );
  
  if (!jobberConnection) {
    console.error("❌ No Jobber OAuth connection found.");
    console.log("\n💡 To test this:");
    console.log("   1. Set up a Jobber OAuth connection via the UI");
    console.log("   2. Or manually insert a test connection");
    console.log("   3. Run this script with an invalid JOBBER_GQL_VERSION");
    process.exit(1);
  }

  console.log("✅ Found Jobber connection for installation:", jobberConnection.installation_id);
  console.log("📊 Current JOBBER_GQL_VERSION:", process.env.JOBBER_GQL_VERSION || "(using default)");
  console.log("\n🔥 Triggering GraphQL call with invalid version...\n");

  try {
    // Import the graphql module which uses JOBBER_GQL_VERSION from env
    const { fetchEstimates } = await import("../src/lib/jobber/graphql");
    
    const result = await fetchEstimates(jobberConnection.installation_id);

    console.log("✅ Unexpected success! Got result:", result);
    console.log("\n⚠️  Expected an error with invalid version, but call succeeded.");
    console.log("   This may mean the version is actually valid, or Jobber is lenient.");
  } catch (err: any) {
    console.log("❌ GraphQL call failed (as expected)\n");
    console.log("📋 Error object details:");
    console.log("   name:", err.name);
    console.log("   message:", err.message);
    console.log("   status:", err.status);
    console.log("   statusText:", err.statusText);
    console.log("   requestId:", err.requestId);
    console.log("   graphqlErrors:", err.graphqlErrors ? "present" : "null");
    console.log("   responseText (first 500 chars):", err.responseText?.slice(0, 500));
    
    console.log("\n✅ Error logging test complete!");
    console.log("\n📝 Verification checklist:");
    console.log("   ✓ status: ", err.status ? "✅" : "❌");
    console.log("   ✓ statusText: ", err.statusText ? "✅" : "❌");
    console.log("   ✓ body/responseText: ", err.responseText ? "✅" : "❌");
    console.log("   ✓ request-id: ", err.requestId ? "✅" : "❌");
  }
}

testJobberGraphQLError().catch(console.error);
