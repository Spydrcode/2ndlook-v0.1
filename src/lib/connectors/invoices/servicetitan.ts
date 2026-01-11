/**
 * ServiceTitan invoice connector (stub).
 * OAuth integration not yet implemented.
 */

import type { UniversalConnector } from "../connector";
import type { InvoiceCanonicalRow } from "../types";
import { NotImplementedError } from "../connector";

export class ServiceTitanInvoiceConnector implements UniversalConnector {
  category = "invoices" as const;
  tool = "servicetitan" as const;
  isImplemented = false;

  getDisplayName(): string {
    return "ServiceTitan";
  }

  async normalizeInvoicesFromFile(): Promise<InvoiceCanonicalRow[]> {
    throw new NotImplementedError(this.tool, "normalizeInvoicesFromFile");
  }

  async fetchInvoices(): Promise<InvoiceCanonicalRow[]> {
    throw new NotImplementedError(this.tool, "fetchInvoices");
  }
}
