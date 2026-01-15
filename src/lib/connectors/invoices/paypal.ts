import type { UniversalConnector } from "../connector";
import { NotImplementedError } from "../connector";
import type { InvoiceCanonicalRow } from "../types";

export class PayPalInvoiceConnector implements UniversalConnector {
  category = "invoices" as const;
  tool = "paypal" as const;
  isImplemented = false;

  getDisplayName(): string {
    return "PayPal";
  }

  async normalizeInvoicesFromFile(): Promise<InvoiceCanonicalRow[]> {
    throw new NotImplementedError(this.tool, "normalizeInvoicesFromFile");
  }

  async fetchInvoices(): Promise<InvoiceCanonicalRow[]> {
    throw new NotImplementedError(this.tool, "fetchInvoices");
  }
}
