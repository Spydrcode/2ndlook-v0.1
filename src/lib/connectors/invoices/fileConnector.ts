/**
 * File-based invoice connector.
 * Supports generic file upload for invoices (CSV, JSON, etc.).
 * Signal-only: no customer names, addresses, line items, notes, taxes, discounts, or payments.
 */

import type { UniversalConnector } from "../connector";
import type { InvoiceCanonicalRow } from "../types";
import { NotImplementedError } from "../connector";

export class FileInvoiceConnector implements UniversalConnector {
  category = "invoices" as const;
  tool = "file" as const;
  isImplemented = true;

  getDisplayName(): string {
    return "File Upload";
  }

  /**
   * Normalize invoices from an uploaded file.
   * For v0.1, validates CSV structure and normalizes to canonical shape.
   */
  async normalizeInvoicesFromFile(
    file: File | Blob | Buffer
  ): Promise<InvoiceCanonicalRow[]> {
    const content = await this.readFileAsText(file);
    const lines = content.split("\n").filter((line) => line.trim().length > 0);

    if (lines.length < 2) {
      throw new Error("Invoice file must contain header and at least one data row");
    }

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const rows: InvoiceCanonicalRow[] = [];

    // Required headers
    const requiredHeaders = ["invoice_id", "invoice_date", "invoice_total", "invoice_status"];
    for (const required of requiredHeaders) {
      if (!headers.includes(required)) {
        throw new Error(`Missing required header: ${required}`);
      }
    }

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim());
      const row: Record<string, string> = {};

      headers.forEach((key, idx) => {
        row[key] = values[idx];
      });

      // Validate invoice_status
      const validStatuses = ["draft", "sent", "void", "paid", "unpaid", "overdue"];
      const status = row.invoice_status?.toLowerCase();
      if (!validStatuses.includes(status)) {
        throw new Error(`Invalid invoice_status at row ${i + 1}: ${row.invoice_status}`);
      }

      // Normalize to canonical shape
      const canonicalRow: InvoiceCanonicalRow = {
        invoice_id: row.invoice_id || `INV-${Date.now()}-${i}`,
        invoice_date: row.invoice_date || new Date().toISOString(),
        invoice_total: Number.parseFloat(row.invoice_total || "0"),
        invoice_status: status as InvoiceCanonicalRow["invoice_status"],
        linked_estimate_id: row.linked_estimate_id || null,
      };

      rows.push(canonicalRow);
    }

    return rows;
  }

  /**
   * Helper to read file content as text.
   */
  private async readFileAsText(file: File | Blob | Buffer): Promise<string> {
    if (file instanceof Buffer) {
      return file.toString("utf-8");
    }

    if (file instanceof Blob || file instanceof File) {
      return await file.text();
    }

    throw new Error("Unsupported file type");
  }

  /**
   * API-based fetch not supported for file connector.
   */
  async fetchInvoices(): Promise<InvoiceCanonicalRow[]> {
    throw new NotImplementedError(this.tool, "fetchInvoices");
  }
}
