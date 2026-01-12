import type { UniversalConnector } from "../connector";
import type { InvoiceCanonicalRow } from "../types";
import { NotImplementedError } from "../connector";

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
