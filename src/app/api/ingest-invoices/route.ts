import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateInstallationId } from "@/lib/installations/cookie";
import { normalizeInvoicesAndStore, type InvoiceRowInput } from "@/lib/ingest/normalize-invoices";

interface InvoiceIngestResponse {
  received: number;
  kept: number;
  rejected: number;
  source_id: string;
}

export async function POST(request: NextRequest) {
  try {
    const installationId = await getOrCreateInstallationId();
    const supabase = createAdminClient();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const source_id = formData.get("source_id") as string | null;

    if (!file || !source_id) {
      return NextResponse.json(
        { error: "file and source_id are required" },
        { status: 400 }
      );
    }

    // Verify source ownership
    const { data: source, error: sourceError } = await supabase
      .from("sources")
      .select("id, installation_id")
      .eq("id", source_id)
      .single();

    if (sourceError || !source || source.installation_id !== installationId) {
      return NextResponse.json({ error: "Invalid source_id" }, { status: 403 });
    }

    // Parse CSV (simple implementation)
    const text = await file.text();
    const lines = text.split("\n").filter((line) => line.trim().length > 0);

    if (lines.length < 2) {
      return NextResponse.json(
        { error: "File must contain header and at least one data row" },
        { status: 400 }
      );
    }

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const requiredHeaders = ["invoice_id", "invoice_date", "invoice_total", "invoice_status"];

    for (const required of requiredHeaders) {
      if (!headers.includes(required)) {
        return NextResponse.json(
          { error: `Missing required header: ${required}` },
          { status: 400 }
        );
      }
    }

    const invoices: InvoiceRowInput[] = [];

    for (let i = 1; i < lines.length; i++) {
      try {
        const values = lines[i].split(",").map((v) => v.trim());
        const row: Record<string, string> = {};

        headers.forEach((key, idx) => {
          row[key] = values[idx];
        });

        invoices.push({
          invoice_id: row.invoice_id,
          invoice_date: row.invoice_date,
          invoice_total: Number.parseFloat(row.invoice_total || "0"),
          invoice_status: row.invoice_status,
          linked_estimate_id: row.linked_estimate_id || null,
        });
      } catch {
        // Skip malformed rows; normalization will track rejection counts
        continue;
      }
    }

    const { kept, rejected } = await normalizeInvoicesAndStore(supabase, source_id, invoices);

    const response: InvoiceIngestResponse = {
      received: lines.length - 1,
      kept,
      rejected,
      source_id,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("Invoice ingest error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
