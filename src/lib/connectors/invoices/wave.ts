import type { UniversalConnector } from "../connector";
import { NotImplementedError } from "../connector";
import type { InvoiceCanonicalRow } from "../types";

export class WaveInvoiceConnector implements UniversalConnector {
  category = "invoices" as const;
  tool = "wave" as const;
  isImplemented = true;

  getDisplayName(): string {
    return "Wave";
  }

  async normalizeInvoicesFromFile(): Promise<InvoiceCanonicalRow[]> {
    throw new NotImplementedError(this.tool, "normalizeInvoicesFromFile");
  }

  async fetchInvoices(): Promise<InvoiceCanonicalRow[]> {
    throw new NotImplementedError(this.tool, "fetchInvoices");
  }
}
