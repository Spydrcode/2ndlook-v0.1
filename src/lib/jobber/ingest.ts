/**
 * Jobber ingestion logic.
 * Fetches estimates from Jobber OAuth connection and creates source.
 */

import { MIN_MEANINGFUL_ESTIMATES_PROD, WINDOW_DAYS } from "@/lib/config/limits";
import { getAdapter } from "@/lib/connectors/registry";
import { runIngestFromPayload } from "@/lib/ingest/runIngest";
import { logJobberConnectionEvent } from "@/lib/jobber/connection-events";
import { createAdminClient } from "@/lib/supabase/admin";

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
 * 3. Normalize and store (enforces 90 days, max 100) via canonical adapter
 * 4. Update source status to 'ingested' and store metadata
 *
 * Returns source_id on success or error message on failure.
 */
export async function ingestJobberEstimates(installationId: string, eventId?: string): Promise<IngestJobberResult> {
  try {
    const supabase = createAdminClient();
    const adapter = getAdapter("jobber");

    try {
      console.log("[JOBBER INGEST] Fetching canonical payload from adapter...");
      const payload = await adapter.fetchPayload({
        oauth_connection_id: installationId,
        window_days: WINDOW_DAYS,
        limits: {
          max_estimates: 100,
          max_invoices: 100,
          max_clients: 100,
          max_jobs: 100,
        },
      });

      console.log("[JOBBER INGEST] Running unified ingest pipeline...");
      const ingestResult = await runIngestFromPayload(payload, installationId, {
        sourceName: "Jobber (OAuth)",
        supabase,
      });

      console.log("[JOBBER INGEST] SUCCESS! Ingestion complete.");
      if (eventId) {
        try {
          await logJobberConnectionEvent({
            installationId,
            eventId,
            phase: "ingest_success",
            details: {
              source_id: ingestResult.source_id,
              meaningful_estimates: ingestResult.meaningful,
              required_min: MIN_MEANINGFUL_ESTIMATES_PROD,
              kept: ingestResult.kept,
              rejected: ingestResult.rejected,
              invoices: ingestResult.invoices_kept,
              jobs: ingestResult.jobs_kept,
              clients: ingestResult.clients_kept,
            },
          });
        } catch (logError) {
          console.error("Failed to log Jobber ingest success:", logError);
        }
      }
      return {
        success: true,
        source_id: ingestResult.source_id,
        status: "ingested",
        meaningful_estimates: ingestResult.meaningful,
        required_min: MIN_MEANINGFUL_ESTIMATES_PROD,
        kept: ingestResult.kept,
        rejected: ingestResult.rejected,
        invoices_kept: ingestResult.invoices_kept,
        jobs_kept: ingestResult.jobs_kept,
        clients_kept: ingestResult.clients_kept,
      };
    } catch (fetchError) {
      // Rollback: delete source on fetch/normalize failure
      console.error("Ingestion failed:", fetchError);

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
      responseText: (err as any)?.responseText ? String((err as any).responseText).slice(0, 2000) : undefined,
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
