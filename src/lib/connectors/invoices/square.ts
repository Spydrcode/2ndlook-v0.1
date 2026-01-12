/**
 * Square invoice connector.
 * OAuth connect is available; data fetch will be implemented later.
 */

import type { UniversalConnector } from "../connector";
import type { InvoiceCanonicalRow } from "../types";
import { NotImplementedError } from "../connector";

export class SquareInvoiceConnector implements UniversalConnector {
  category = "invoices" as const;
  tool = "square" as const;
  isImplemented = true;

  getDisplayName(): string {
    return "Square";
  }

  async normalizeInvoicesFromFile(): Promise<InvoiceCanonicalRow[]> {
    throw new NotImplementedError(this.tool, "normalizeInvoicesFromFile");
  }

  async fetchInvoices(): Promise<InvoiceCanonicalRow[]> {
    throw new NotImplementedError(this.tool, "fetchInvoices");
  }
}
