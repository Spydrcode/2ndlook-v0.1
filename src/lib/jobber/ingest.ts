/**
 * Jobber ingestion logic.
 * Fetches estimates from Jobber OAuth connection and creates source.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchEstimates } from "./graphql";
import { normalizeAndStore } from "@/lib/ingest/normalize-estimates";
import { MIN_MEANINGFUL_ESTIMATES_PROD } from "@/lib/config/limits";
import { logJobberConnectionEvent } from "@/lib/jobber/connection-events";

export interface IngestJobberResult {
  success: boolean;
  source_id?: string;
  error?: string;
  meaningful_estimates?: number;
  required_min?: number;
  status?: "ingested";
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
 * 4. Update source status to 'ingested' and store metadata
 * 
 * Returns source_id on success or error message on failure.
 */
export async function ingestJobberEstimates(
  installationId: string,
  eventId?: string
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
      console.log("[JOBBER INGEST] Fetching estimates from Jobber for installation:", installationId);
      const estimateRows = await fetchEstimates(installationId);
      console.log(`[JOBBER INGEST] Fetched ${estimateRows.length} estimates from Jobber`);
      
      if (estimateRows.length === 0) {
        console.log("[JOBBER INGEST] WARNING: Zero estimates returned from Jobber API");
        console.log("[JOBBER INGEST] This usually means:");
        console.log("[JOBBER INGEST]   1. Wrong GraphQL query structure (nodes vs edges.node)");
        console.log("[JOBBER INGEST]   2. No recent quotes in last 90 days");
        console.log("[JOBBER INGEST]   3. Missing scope (might need requests:read)");
      } else {
        console.log("[JOBBER INGEST] Sample estimate data:", JSON.stringify(estimateRows.slice(0, 2), null, 2));
      }

      // Normalize and store (applies 90 day cutoff and max 100)
      console.log("[JOBBER INGEST] Normalizing and storing estimates...");
      const { kept, rejected, meaningful } = await normalizeAndStore(
        supabase,
        sourceId,
        estimateRows
      );

      console.log(`[JOBBER INGEST] Normalization complete: ${kept} kept, ${rejected} rejected`);

      console.log("[JOBBER INGEST] Updating source status to ingested...");
      await supabase
        .from("sources")
        .update({
          status: "ingested",
          metadata: {
            meaningful_estimates: meaningful,
            required_min: MIN_MEANINGFUL_ESTIMATES_PROD,
          },
        })
        .eq("id", sourceId);

      console.log("[JOBBER INGEST] SUCCESS! Ingestion complete.");
      if (eventId) {
        try {
          await logJobberConnectionEvent({
            installationId,
            eventId,
            phase: "ingest_success",
            details: {
              source_id: sourceId,
              meaningful_estimates: meaningful,
              required_min: MIN_MEANINGFUL_ESTIMATES_PROD,
              kept,
              rejected,
            },
          });
        } catch (logError) {
          console.error("Failed to log Jobber ingest success:", logError);
        }
      }
      return {
        success: true,
        source_id: sourceId,
        status: "ingested",
        meaningful_estimates: meaningful,
        required_min: MIN_MEANINGFUL_ESTIMATES_PROD,
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

      if (eventId) {
        try {
          await logJobberConnectionEvent({
            installationId,
            eventId,
            phase: "ingest_error",
            details: {
              source_id: sourceId,
              error:
                fetchError instanceof Error ? fetchError.message : "Ingestion failed",
            },
          });
        } catch (logError) {
          console.error("Failed to log Jobber ingest error:", logError);
        }
      }

      return {
        success: false,
        error: fetchError instanceof Error ? fetchError.message : "Ingestion failed",
      };
    }
  } catch (err) {
    console.error("Unexpected ingestion error:", err);
    if (eventId) {
      try {
        await logJobberConnectionEvent({
          installationId,
          eventId,
          phase: "ingest_error",
          details: {
            error: err instanceof Error ? err.message : "Unexpected ingestion error",
          },
        });
      } catch (logError) {
        console.error("Failed to log Jobber ingest error:", logError);
      }
    }
    return {
      success: false,
      error: "Unexpected error during ingestion",
    };
  }
}


