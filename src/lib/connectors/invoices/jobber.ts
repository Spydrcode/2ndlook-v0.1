/**
 * Jobber invoice connector (OAuth-based).
 *
 * Invoices are ingested via the Jobber OAuth flow:
 * - /api/oauth/jobber/start
 * - /api/oauth/jobber/callback (exchanges code + triggers ingestion)
 * - /api/oauth/jobber/ingest (fetches invoices/jobs/clients/estimates)
 */

import type { UniversalConnector } from "../connector";
import type { InvoiceCanonicalRow } from "../types";
import { NotImplementedError } from "../connector";

export class JobberInvoiceConnector implements UniversalConnector {
  category = "invoices" as const;
  tool = "jobber" as const;
  isImplemented = true;

  getDisplayName(): string {
    return "Jobber";
  }

  async normalizeInvoicesFromFile(): Promise<InvoiceCanonicalRow[]> {
    throw new NotImplementedError(this.tool, "normalizeInvoicesFromFile (OAuth-only connector)");
  }

  async fetchInvoices(): Promise<InvoiceCanonicalRow[]> {
    throw new NotImplementedError(this.tool, "fetchInvoices (handled via OAuth ingestion)");
  }
}
