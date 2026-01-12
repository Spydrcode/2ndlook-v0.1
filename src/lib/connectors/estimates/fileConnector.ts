/**
 * File-based estimate connector.
 * Supports generic file upload for estimates (CSV, JSON, etc.).
 * This is the v0.1 implementation used by the import flow.
 */

import type { UniversalConnector } from "../connector";
import type { EstimateCanonicalRow } from "../types";
import { NotImplementedError } from "../connector";
import { normalizeEstimateStatus } from "@/lib/ingest/statuses";

export class FileEstimateConnector implements UniversalConnector {
  category = "estimates" as const;
  tool = "file" as const;
  isImplemented = true;

  getDisplayName(): string {
    return "File Upload";
  }

  /**
   * Normalize estimates from an uploaded file.
   * For v0.1, this is a placeholder that validates the file structure
   * without duplicating the existing /api/ingest logic.
   */
  async normalizeEstimatesFromFile(
    file: File | Blob | Buffer
  ): Promise<EstimateCanonicalRow[]> {
    // Parse file content
    const text = await this.readFileAsText(file);

    // Basic CSV parsing (expecting header + rows)
    const lines = text.trim().split("\n");
    if (lines.length < 2) {
      throw new Error("File must contain at least a header row and one data row");
    }

    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const rows: EstimateCanonicalRow[] = [];

    // Required columns
    const requiredColumns = ["estimate_id", "created_at", "amount", "status"];
    const missingColumns = requiredColumns.filter((col) => !header.includes(col));
    if (missingColumns.length > 0) {
      throw new Error(`Missing required columns: ${missingColumns.join(", ")}`);
    }

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim());
      if (values.length !== header.length) {
        continue; // Skip malformed rows
      }

      const row: Record<string, string> = {};
      header.forEach((key, idx) => {
        row[key] = values[idx];
      });

      // Normalize to canonical shape
      const canonicalRow: EstimateCanonicalRow = {
        estimate_id: row.estimate_id || `EST-${Date.now()}-${i}`,
        created_at: row.created_at || new Date().toISOString(),
        closed_at: row.closed_at || null,
        updated_at: row.updated_at || null,
        amount: Number.parseFloat(row.amount || "0"),
        status: normalizeEstimateStatus(row.status),
        job_type: row.job_type || null,
      };

      rows.push(canonicalRow);
    }

    return rows;
  }

  /**
   * Helper to read file content as text.
   */
  private async readFileAsText(file: File | Blob | Buffer): Promise<string> {
    if (Buffer.isBuffer(file)) {
      return file.toString("utf-8");
    }

    // Both File and Blob have text() method
    return await (file as Blob).text();
  }

  /**
   * API-based fetch not supported for file connector.
   */
  async fetchEstimates(): Promise<EstimateCanonicalRow[]> {
    throw new NotImplementedError(this.tool, "fetchEstimates");
  }
}
