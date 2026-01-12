import type { UniversalConnector } from "../connector";
import type { InvoiceCanonicalRow } from "../types";
import { NotImplementedError } from "../connector";

export class ZohoInvoiceConnector implements UniversalConnector {
  category = "invoices" as const;
  tool = "zoho-invoice" as const;
  isImplemented = true;

  getDisplayName(): string {
    return "Zoho Invoice";
  }

  async normalizeInvoicesFromFile(): Promise<InvoiceCanonicalRow[]> {
    throw new NotImplementedError(this.tool, "normalizeInvoicesFromFile");
  }

  async fetchInvoices(): Promise<InvoiceCanonicalRow[]> {
    throw new NotImplementedError(this.tool, "fetchInvoices");
  }
}
