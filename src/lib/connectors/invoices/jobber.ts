/**
 * Jobber invoice connector (stub).
 * OAuth integration not yet implemented.
 */

import type { UniversalConnector } from "../connector";
import type { InvoiceCanonicalRow } from "../types";
import { NotImplementedError } from "../connector";

export class JobberInvoiceConnector implements UniversalConnector {
  category = "invoices" as const;
  tool = "jobber" as const;
  isImplemented = false;

  getDisplayName(): string {
    return "Jobber";
  }

  async normalizeInvoicesFromFile(): Promise<InvoiceCanonicalRow[]> {
    throw new NotImplementedError(this.tool, "normalizeInvoicesFromFile");
  }

  async fetchInvoices(): Promise<InvoiceCanonicalRow[]> {
    throw new NotImplementedError(this.tool, "fetchInvoices");
  }
}
