/**
 * Jobber ingestion logic.
 * Fetches estimates from Jobber OAuth connection and creates source.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchClients, fetchEstimates, fetchInvoices, fetchJobs } from "./graphql";
import { normalizeAndStore } from "@/lib/ingest/normalize-estimates";
import { normalizeInvoicesAndStore } from "@/lib/ingest/normalize-invoices";
import { normalizeJobsAndStore } from "@/lib/ingest/normalize-jobs";
import { normalizeClientsAndStore } from "@/lib/ingest/normalize-clients";
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
  invoices_kept?: number;
  jobs_kept?: number;
  clients_kept?: number;
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

      // Fetch and normalize invoices
      let keptInvoices = 0;
      let rejectedInvoices = 0;
      try {
        console.log("[JOBBER INGEST] Fetching invoices from Jobber...");
        const invoiceRows = await fetchInvoices(installationId);
        console.log(`[JOBBER INGEST] Fetched ${invoiceRows.length} invoices from Jobber`);
        const result = await normalizeInvoicesAndStore(supabase, sourceId, invoiceRows);
        keptInvoices = result.kept;
        rejectedInvoices = result.rejected;
        console.log(
          `[JOBBER INGEST] Invoice normalization complete: ${keptInvoices} kept, ${rejectedInvoices} rejected`
        );
      } catch (invoiceError) {
        console.error(
          "[JOBBER INGEST] Invoice ingest skipped (non-fatal):",
          invoiceError instanceof Error ? invoiceError.message : invoiceError
        );
      }

      // Fetch and normalize jobs
      let keptJobs = 0;
      let rejectedJobs = 0;
      try {
        console.log("[JOBBER INGEST] Fetching jobs from Jobber...");
        const jobRows = await fetchJobs(installationId);
        console.log(`[JOBBER INGEST] Fetched ${jobRows.length} jobs from Jobber`);
        const result = await normalizeJobsAndStore(supabase, sourceId, jobRows);
        keptJobs = result.kept;
        rejectedJobs = result.rejected;
        console.log(
          `[JOBBER INGEST] Job normalization complete: ${keptJobs} kept, ${rejectedJobs} rejected`
        );
      } catch (jobError) {
        console.error(
          "[JOBBER INGEST] Job ingest skipped (non-fatal):",
          jobError instanceof Error ? jobError.message : jobError
        );
      }

      // Fetch and normalize clients
      let keptClients = 0;
      let rejectedClients = 0;
      try {
        console.log("[JOBBER INGEST] Fetching clients from Jobber...");
        const clientRows = await fetchClients(installationId);
        console.log(`[JOBBER INGEST] Fetched ${clientRows.length} clients from Jobber`);
        const result = await normalizeClientsAndStore(supabase, sourceId, clientRows);
        keptClients = result.kept;
        rejectedClients = result.rejected;
        console.log(
          `[JOBBER INGEST] Client normalization complete: ${keptClients} kept, ${rejectedClients} rejected`
        );
      } catch (clientError) {
        console.error(
          "[JOBBER INGEST] Client ingest skipped (non-fatal):",
          clientError instanceof Error ? clientError.message : clientError
        );
      }

      console.log("[JOBBER INGEST] Updating source status to ingested...");
      await supabase
        .from("sources")
        .update({
          status: "ingested",
          metadata: {
            meaningful_estimates: meaningful,
            required_min: MIN_MEANINGFUL_ESTIMATES_PROD,
            totals: {
              estimates: kept,
              invoices: keptInvoices,
              jobs: keptJobs,
              clients: keptClients,
            },
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
              invoices: keptInvoices,
              jobs: keptJobs,
              clients: keptClients,
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
        invoices_kept: keptInvoices,
        jobs_kept: keptJobs,
        clients_kept: keptClients,
      };
    } catch (fetchError) {
      // Rollback: delete source on fetch/normalize failure
      console.error("Ingestion failed:", fetchError);
      await supabase
        .from("sources")
        .delete()
        .eq("id", sourceId);

      const err = fetchError as any;
      const errorDetails = {
        ok: false,
        error: err?.message ?? String(fetchError),
        name: err?.name,
        stack: err?.stack,
        status: err?.status,
        statusText: err?.statusText,
        requestId: err?.requestId,
        graphqlErrors: err?.graphqlErrors,
        responseText: err?.responseText ? String(err.responseText).slice(0, 2000) : undefined,
      };

      if (eventId) {
        try {
          await logJobberConnectionEvent({
            installationId,
            eventId,
            phase: "ingest_error",
            details: errorDetails,
          });
        } catch (logError) {
          console.error("Failed to log Jobber ingest error:", logError);
        }
      }

      return {
        success: false,
        error: errorDetails.error,
      };
    }
  } catch (err) {
    console.error("Unexpected ingestion error:", err);
    const errorDetails = {
      ok: false,
      error: err instanceof Error ? err.message : "Unexpected ingestion error",
      name: err instanceof Error ? err.name : undefined,
      stack: err instanceof Error ? err.stack : undefined,
      status: (err as any)?.status,
      statusText: (err as any)?.statusText,
      requestId: (err as any)?.requestId,
      graphqlErrors: (err as any)?.graphqlErrors,
      responseText: (err as any)?.responseText
        ? String((err as any).responseText).slice(0, 2000)
        : undefined,
    };
    if (eventId) {
      try {
        await logJobberConnectionEvent({
          installationId,
          eventId,
          phase: "ingest_error",
          details: errorDetails,
        });
      } catch (logError) {
        console.error("Failed to log Jobber ingest error:", logError);
      }
    }
    return {
      success: false,
      error: errorDetails.error,
    };
  }
}


