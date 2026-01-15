#!/usr/bin/env node

/**
 * Look up a specific Jobber connection event by ID
 *
 * Usage:
 *   npx tsx scripts/lookup-event.ts <event-id>
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing environment variables");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const eventId = process.argv[2] || "61f2f069-1c24-4e5c-8c61-8186974f943f";

async function lookupEvent() {
  console.log("\n🔍 Looking up event:", eventId);
  console.log("=====================================\n");

  const { data, error } = await supabase
    .from("jobber_connection_events")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("❌ Error querying event:", error);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.error("❌ Event not found");
    process.exit(1);
  }

  console.log(`📋 Found ${data.length} events with this ID\n`);

  for (const event of data) {
    console.log("─".repeat(60));
    console.log("📋 Event Details:");
    console.log("   Phase:", event.phase);
    console.log("   Created:", event.created_at);
    console.log("   Installation:", event.installation_id);
    console.log("\n📊 Error Details:");
    console.log(JSON.stringify(event.details, null, 2));

    if (event.details?.graphqlErrors) {
      console.log("\n🔴 GraphQL Errors:");
      console.log(JSON.stringify(event.details.graphqlErrors, null, 2));
    }

    if (event.details?.responseText) {
      console.log("\n📄 Full Response:");
      console.log(event.details.responseText);
    }
    console.log();
  }
}

lookupEvent().catch(console.error);
