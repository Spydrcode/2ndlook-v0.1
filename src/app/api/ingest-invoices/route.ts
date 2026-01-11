import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { InvoiceCanonicalRow } from "@/lib/connectors";

interface InvoiceIngestResponse {
  received: number;
  kept: number;
  rejected: number;
  source_id: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();

    // Verify auth
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
      .select("id, user_id")
      .eq("id", source_id)
      .single();

    if (sourceError || !source || source.user_id !== user.id) {
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

    const validStatuses = ["draft", "sent", "void", "paid", "unpaid", "overdue"];
    const invoices: InvoiceCanonicalRow[] = [];
    let rejected = 0;

    // Apply data limits: last 90 days OR max 100 invoices
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    for (let i = 1; i < lines.length; i++) {
      try {
        const values = lines[i].split(",").map((v) => v.trim());
        const row: Record<string, string> = {};

        headers.forEach((key, idx) => {
          row[key] = values[idx];
        });

        const status = row.invoice_status?.toLowerCase();
        if (!validStatuses.includes(status)) {
          rejected++;
          continue;
        }

        const invoiceDate = new Date(row.invoice_date);
        if (invoiceDate < ninetyDaysAgo) {
          rejected++;
          continue;
        }

        invoices.push({
          invoice_id: row.invoice_id,
          invoice_date: row.invoice_date,
          invoice_total: Number.parseFloat(row.invoice_total || "0"),
          invoice_status: status as InvoiceCanonicalRow["invoice_status"],
          linked_estimate_id: row.linked_estimate_id || null,
        });
      } catch {
        rejected++;
      }
    }

    // Apply max 100 limit
    const keptInvoices = invoices.slice(0, 100);
    rejected += invoices.length - keptInvoices.length;

    // Store normalized invoices
    if (keptInvoices.length > 0) {
      const dbRows = keptInvoices.map((inv) => ({
        invoice_id: inv.invoice_id,
        source_id,
        invoice_date: inv.invoice_date,
        invoice_total: inv.invoice_total,
        invoice_status: inv.invoice_status,
        linked_estimate_id: inv.linked_estimate_id,
      }));

      const { error: insertError } = await supabase
        .from("invoices_normalized")
        .insert(dbRows);

      if (insertError) {
        console.error("Invoice insert error:", insertError);
        return NextResponse.json(
          { error: "Failed to store invoices" },
          { status: 500 }
        );
      }
    }

    const response: InvoiceIngestResponse = {
      received: lines.length - 1,
      kept: keptInvoices.length,
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
