/**
 * Jobber invoice connector (OAuth-based).
 * 
 * OAuth flow handles ingestion automatically via:
 * - /api/oauth/jobber/start (initiate)
 * - /api/oauth/jobber/callback (exchange tokens + ingest)
 * - /api/oauth/jobber/ingest (fetch & normalize both estimates + invoices)
 * 
 * This connector is for direct API usage if needed.
 */

import type { UniversalConnector } from "../connector";
import type { InvoiceCanonicalRow } from "../types";
import { NotImplementedError } from "../connector";

export class JobberInvoiceConnector implements UniversalConnector {
  category = "invoices" as const;
  tool = "jobber" as const;
  isImplemented = true; // OAuth implementation available

  getDisplayName(): string {
    return "Jobber";
  }

  async normalizeInvoicesFromFile(): Promise<InvoiceCanonicalRow[]> {
    // Jobber uses OAuth, not file upload
    throw new NotImplementedError(
      this.tool,
      "normalizeInvoicesFromFile (OAuth-only connector)"
    );
  }

  async fetchInvoices(): Promise<InvoiceCanonicalRow[]> {
    // OAuth ingestion handles this via /api/oauth/jobber/ingest
    throw new NotImplementedError(
      this.tool,
      "fetchInvoices (use OAuth ingestion endpoint)"
    );
  }
}
