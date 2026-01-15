/**
 * Jobber estimate connector (OAuth-based).
 *
 * OAuth flow handles ingestion automatically via:
 * - /api/oauth/jobber/start (initiate)
 * - /api/oauth/jobber/callback (exchange tokens + ingest)
 * - /api/oauth/jobber/ingest (fetch & normalize)
 *
 * This connector is for direct API usage if needed.
 */

import type { UniversalConnector } from "../connector";
import { NotImplementedError } from "../connector";
import type { EstimateCanonicalRow } from "../types";

export class JobberConnector implements UniversalConnector {
  category = "estimates" as const;
  tool = "jobber" as const;
  isImplemented = true; // OAuth implementation available

  getDisplayName(): string {
    return "Jobber";
  }

  async normalizeEstimatesFromFile(): Promise<EstimateCanonicalRow[]> {
    // Jobber uses OAuth, not file upload
    throw new NotImplementedError(this.tool, "normalizeEstimatesFromFile (OAuth-only connector)");
  }

  async fetchEstimates(): Promise<EstimateCanonicalRow[]> {
    // OAuth ingestion handles this via /api/oauth/jobber/ingest
    throw new NotImplementedError(this.tool, "fetchEstimates (use OAuth ingestion endpoint)");
  }
}
