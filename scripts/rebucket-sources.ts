#!/usr/bin/env node

/**
 * Rebucket existing sources to populate job_type_distribution
 *
 * Usage:
 *   npx tsx scripts/rebucket-sources.ts
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

async function rebucketSources() {
  console.log("\n🔄 Rebucketing existing sources to populate job_type_distribution");
  console.log("================================================================\n");

  // Get all sources
  const { data: sources, error } = await supabase.from("sources").select("id, source_type").eq("status", "ingested");

  if (error || !sources) {
    console.error("❌ Failed to get sources:", error);
    process.exit(1);
  }

  console.log(`📊 Found ${sources.length} ingested sources\n`);

  for (const source of sources) {
    console.log(`Processing source ${source.id} (${source.source_type})...`);

    // Get estimates for this source
    const { data: estimates } = await supabase
      .from("estimates_normalized")
      .select("job_type")
      .eq("source_id", source.id);

    if (!estimates || estimates.length === 0) {
      console.log("  ⚠️  No estimates found, skipping");
      continue;
    }

    // Count by job_type
    const jobTypeCounts = new Map<string, number>();
    for (const est of estimates) {
      const jobType = est.job_type || "unknown";
      jobTypeCounts.set(jobType, (jobTypeCounts.get(jobType) || 0) + 1);
    }

    // Build distribution array
    const jobTypeDistribution = Array.from(jobTypeCounts.entries())
      .map(([job_type, count]) => ({ job_type, count }))
      .sort((a, b) => b.count - a.count);

    console.log(`  ✓ Job type distribution:`, jobTypeDistribution);

    // Update bucket
    const { error: updateError } = await supabase
      .from("estimate_buckets")
      .update({ job_type_distribution: jobTypeDistribution })
      .eq("source_id", source.id);

    if (updateError) {
      console.error(`  ❌ Failed to update bucket:`, updateError);
    } else {
      console.log(`  ✅ Updated bucket`);
    }
  }

  console.log("\n✅ Rebucketing complete!");
}

rebucketSources().catch(console.error);
