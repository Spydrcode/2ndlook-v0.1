/**
 * Jobber ingestion logic.
 * Fetches estimates from Jobber OAuth connection and creates source.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchClosedEstimates } from "./graphql";
import { normalizeAndStore, MIN_ESTIMATES } from "@/lib/ingest/normalize-estimates";

export interface IngestJobberResult {
  success: boolean;
  source_id?: string;
  error?: string;
  kept?: number;
  rejected?: number;
}

/**
 * Ingest Jobber estimates for an installation.
 * 
 * Steps:
 * 1. Create source with status='pending'
 * 2. Fetch estimates from Jobber
 * 3. Normalize and store (enforces 90 days, max 100)
 * 4. Check minimum 25 estimates
 * 5. Update source status to 'ingested' or rollback on failure
 * 
 * Returns source_id on success or error message on failure.
 */
export async function ingestJobberEstimates(
  installationId: string
): Promise<IngestJobberResult> {
  try {
    const supabase = createAdminClient();

    // Create source
    const { data: source, error: sourceError } = await supabase
      .from("sources")
      .insert({
        installation_id: installationId,
        source_type: "jobber",
        source_name: "Jobber (OAuth)",
        status: "pending",
      })
      .select()
      .single();

    if (sourceError || !source) {
      console.error("Failed to create source:", sourceError);
      return {
        success: false,
        error: "Failed to create source",
      };
    }

    const sourceId = source.id;

    try {
      // Fetch estimates from Jobber
      console.log("[JOBBER INGEST] Fetching closed estimates from Jobber for installation:", installationId);
      const estimateRows = await fetchClosedEstimates(installationId);
      console.log(`[JOBBER INGEST] Fetched ${estimateRows.length} closed/accepted estimates from Jobber`);
      
      if (estimateRows.length === 0) {
        console.log("[JOBBER INGEST] WARNING: Zero estimates returned from Jobber API");
        console.log("[JOBBER INGEST] This usually means:");
        console.log("[JOBBER INGEST]   1. Wrong GraphQL query structure (nodes vs edges.node)");
        console.log("[JOBBER INGEST]   2. No closed/accepted quotes in last 90 days");
        console.log("[JOBBER INGEST]   3. Missing scope (might need requests:read)");
      } else {
        console.log("[JOBBER INGEST] Sample estimate data:", JSON.stringify(estimateRows.slice(0, 2), null, 2));
      }

      // Normalize and store (applies 90 day cutoff and max 100)
      console.log("[JOBBER INGEST] Normalizing and storing estimates...");
      const { kept, rejected } = await normalizeAndStore(
        supabase,
        sourceId,
        estimateRows
      );

      console.log(`[JOBBER INGEST] Normalization complete: ${kept} kept, ${rejected} rejected`);

      // Enforce minimum constraint
      if (kept < MIN_ESTIMATES) {
        console.log(`[JOBBER INGEST] MINIMUM NOT MET: Need ${MIN_ESTIMATES}, got ${kept}`);
        console.log("[JOBBER INGEST] Rolling back source and estimates...");
        
        // Rollback: delete source and estimates
        await supabase
          .from("estimates_normalized")
          .delete()
          .eq("source_id", sourceId);

        await supabase
          .from("sources")
          .delete()
          .eq("id", sourceId);

        console.log("[JOBBER INGEST] Rollback complete");
        return {
          success: false,
          error: `Minimum ${MIN_ESTIMATES} closed estimates required. Found: ${kept}`,
        };
      }

      console.log("[JOBBER INGEST] Minimum met! Updating source status to ingested...");
      // Update source status to ingested
      await supabase
        .from("sources")
        .update({ status: "ingested" })
        .eq("id", sourceId);

      console.log("[JOBBER INGEST] SUCCESS! Ingestion complete.");
      return {
        success: true,
        source_id: sourceId,
        kept,
        rejected,
      };
    } catch (fetchError) {
      // Rollback: delete source on fetch/normalize failure
      console.error("Ingestion failed:", fetchError);
      await supabase
        .from("sources")
        .delete()
        .eq("id", sourceId);

      return {
        success: false,
        error: fetchError instanceof Error ? fetchError.message : "Ingestion failed",
      };
    }
  } catch (err) {
    console.error("Unexpected ingestion error:", err);
    return {
      success: false,
      error: "Unexpected error during ingestion",
    };
  }
}


