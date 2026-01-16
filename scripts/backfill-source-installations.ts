#!/usr/bin/env tsx

/**
 * Backfill installation_id for sources that don't have it set
 * Usage: npx tsx scripts/backfill-source-installations.ts <installation-id>
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

async function backfillInstallations(installationId: string) {
  console.log("\n🔧 Backfilling installation_id for orphaned sources");
  console.log("==================================================\n");
  console.log("Target installation_id:", installationId);

  // Find sources without installation_id
  const { data: orphanedSources, error: findError } = await supabase
    .from("sources")
    .select("id, source_type, source_name, created_at, user_id")
    .is("installation_id", null);

  if (findError) {
    console.error("❌ Error finding sources:", findError.message);
    process.exit(1);
  }

  if (!orphanedSources || orphanedSources.length === 0) {
    console.log("✅ No orphaned sources found - all sources have installation_id set");
    return;
  }

  console.log(`Found ${orphanedSources.length} source(s) without installation_id:\n`);
  for (const src of orphanedSources) {
    console.log(`  - ${src.id}`);
    console.log(`    Type: ${src.source_type}`);
    console.log(`    Name: ${src.source_name}`);
    console.log(`    Created: ${src.created_at}`);
    console.log(`    User ID: ${src.user_id || "null"}\n`);
  }

  // Update all orphaned sources
  console.log(`\n🔄 Updating ${orphanedSources.length} source(s)...`);
  const { error: updateError } = await supabase
    .from("sources")
    .update({ installation_id: installationId })
    .is("installation_id", null);

  if (updateError) {
    console.error("❌ Error updating sources:", updateError.message);
    process.exit(1);
  }

  console.log(`✅ Successfully updated ${orphanedSources.length} source(s)`);
  console.log(`   All sources now have installation_id: ${installationId}`);

  // Verify
  const { data: remaining, error: verifyError } = await supabase
    .from("sources")
    .select("id")
    .is("installation_id", null);

  if (verifyError) {
    console.error("⚠️  Could not verify:", verifyError.message);
  } else if (remaining && remaining.length > 0) {
    console.log(`\n⚠️  Warning: ${remaining.length} source(s) still without installation_id`);
  } else {
    console.log("\n🎉 All sources now have installation_id set!");
  }
}

const installationId = process.argv[2];

if (!installationId) {
  console.error("Usage: npx tsx scripts/backfill-source-installations.ts <installation-id>");
  console.error("\nTo find your installation_id, check your browser cookies for 'installation_id'");
  process.exit(1);
}

backfillInstallations(installationId);
