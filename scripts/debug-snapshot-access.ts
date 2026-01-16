#!/usr/bin/env tsx

/**
 * Debug script to check snapshot access issues
 * Run with: npx tsx scripts/debug-snapshot-access.ts <snapshot-id>
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

// Load environment
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

async function debugSnapshotAccess(snapshotId: string, installationId?: string) {
  console.log("\n🔍 Debug Snapshot Access");
  console.log("========================\n");
  console.log("Snapshot ID:", snapshotId);
  console.log("Installation ID:", installationId || "not provided");

  // 1. Check if snapshot exists
  console.log("\n1️⃣ Checking if snapshot exists...");
  const { data: snapshot, error: snapshotError } = await supabase
    .from("snapshots")
    .select("*")
    .eq("id", snapshotId)
    .single();

  if (snapshotError || !snapshot) {
    console.log("❌ Snapshot not found");
    console.log("   Error:", snapshotError?.message);
    return;
  }

  console.log("✅ Snapshot exists");
  console.log("   source_id:", snapshot.source_id);
  console.log("   user_id:", snapshot.user_id);
  console.log("   estimate_count:", snapshot.estimate_count);
  console.log("   generated_at:", snapshot.generated_at);

  // 2. Check the source
  console.log("\n2️⃣ Checking source...");
  const { data: source, error: sourceError } = await supabase
    .from("sources")
    .select("*")
    .eq("id", snapshot.source_id)
    .single();

  if (sourceError || !source) {
    console.log("❌ Source not found");
    console.log("   Error:", sourceError?.message);
    return;
  }

  console.log("✅ Source exists");
  console.log("   id:", source.id);
  console.log("   installation_id:", source.installation_id || "NULL ⚠️");
  console.log("   user_id:", source.user_id);
  console.log("   source_type:", source.source_type);
  console.log("   source_name:", source.source_name);

  // 3. Test the join query (what the page uses)
  if (installationId) {
    console.log("\n3️⃣ Testing join query with installation filter...");
    const { data: joinResult, error: joinError } = await supabase
      .from("snapshots")
      .select("*, sources!inner(installation_id)")
      .eq("id", snapshotId)
      .eq("sources.installation_id", installationId)
      .single();

    if (joinError || !joinResult) {
      console.log("❌ Join query failed");
      console.log("   Error:", joinError?.message);
      console.log("\n💡 Diagnosis:");
      if (!source.installation_id) {
        console.log("   ⚠️  Source has NULL installation_id - this is the problem!");
        console.log("   The join filter requires installation_id to match, but it's NULL.");
        console.log("\n   Fix: Update the source to have installation_id set:");
        console.log(`   UPDATE sources SET installation_id = '${installationId}' WHERE id = '${source.id}';`);
      } else if (source.installation_id !== installationId) {
        console.log(`   ⚠️  Installation ID mismatch!`);
        console.log(`   Source installation_id: ${source.installation_id}`);
        console.log(`   Requested installation_id: ${installationId}`);
      }
    } else {
      console.log("✅ Join query succeeded");
      console.log("   Snapshot is accessible with this installation_id");
    }
  }

  // 4. List all snapshots for this installation
  if (installationId) {
    console.log("\n4️⃣ Listing all snapshots for this installation...");
    const { data: allSnapshots, error: listError } = await supabase
      .from("snapshots")
      .select("id, source_id, estimate_count, generated_at, sources!inner(installation_id, source_type, source_name)")
      .eq("sources.installation_id", installationId)
      .order("generated_at", { ascending: false })
      .limit(10);

    if (listError) {
      console.log("❌ Error listing snapshots:", listError.message);
    } else {
      console.log(`✅ Found ${allSnapshots?.length || 0} snapshot(s) for this installation`);
      for (const snap of allSnapshots || []) {
        console.log(`   - ${snap.id} (${snap.estimate_count} estimates, ${snap.generated_at})`);
      }
    }
  }

  // 5. Check for sources without installation_id
  console.log("\n5️⃣ Checking for sources without installation_id...");
  const { data: orphanedSources, error: orphanError } = await supabase
    .from("sources")
    .select("id, source_type, source_name, created_at")
    .is("installation_id", null)
    .order("created_at", { ascending: false })
    .limit(5);

  if (orphanError) {
    console.log("❌ Error checking:", orphanError.message);
  } else if (orphanedSources && orphanedSources.length > 0) {
    console.log(`⚠️  Found ${orphanedSources.length} source(s) without installation_id:`);
    for (const src of orphanedSources) {
      console.log(`   - ${src.id} (${src.source_type}: ${src.source_name})`);
    }
    console.log("\n   These sources need to be associated with an installation.");
  } else {
    console.log("✅ All sources have installation_id set");
  }
}

const snapshotId = process.argv[2];
const installationId = process.argv[3];

if (!snapshotId) {
  console.error("Usage: npx tsx scripts/debug-snapshot-access.ts <snapshot-id> [installation-id]");
  process.exit(1);
}

debugSnapshotAccess(snapshotId, installationId);
