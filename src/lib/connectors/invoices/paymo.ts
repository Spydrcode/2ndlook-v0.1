import type { UniversalConnector } from "../connector";
import { NotImplementedError } from "../connector";
import type { InvoiceCanonicalRow } from "../types";

export class PaymoInvoiceConnector implements UniversalConnector {
  category = "invoices" as const;
  tool = "paymo" as const;
  isImplemented = false;

  getDisplayName(): string {
    return "Paymo";
  }

  async normalizeInvoicesFromFile(): Promise<InvoiceCanonicalRow[]> {
    throw new NotImplementedError(this.tool, "normalizeInvoicesFromFile");
  }

  async fetchInvoices(): Promise<InvoiceCanonicalRow[]> {
    throw new NotImplementedError(this.tool, "fetchInvoices");
  }
}
