import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateInstallationId } from "@/lib/installations/cookie";
import type { IngestResponse, CSVEstimateRow } from "@/types/2ndlook";
import { normalizeAndStore } from "@/lib/ingest/normalize-estimates";
import { MIN_MEANINGFUL_ESTIMATES_PROD } from "@/lib/config/limits";

export async function POST(request: NextRequest) {
  try {
    const installationId = await getOrCreateInstallationId();
    const supabase = createAdminClient();

    // Parse form data
    const formData = await request.formData();
    const sourceId = formData.get("source_id") as string;
    const file = formData.get("file") as File;

    if (!sourceId || !file) {
      return NextResponse.json(
        { error: "source_id and file are required" },
        { status: 400 }
      );
    }

    // Verify source ownership
    const { data: source, error: sourceError } = await supabase
      .from("sources")
      .select("id, installation_id")
      .eq("id", sourceId)
      .single();

    if (sourceError || !source || source.installation_id !== installationId) {
      return NextResponse.json({ error: "Invalid source_id" }, { status: 403 });
    }

    // Parse CSV
    const text = await file.text();
    const rows = parseCSV(text);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No valid rows found in CSV" },
        { status: 400 }
      );
    }

    // Normalize and filter
    const { kept, rejected, meaningful } = await normalizeAndStore(
      supabase,
      sourceId,
      rows
    );

    await supabase
      .from("sources")
      .update({
        status: "ingested",
        metadata: {
          meaningful_estimates: meaningful,
          required_min: MIN_MEANINGFUL_ESTIMATES_PROD,
        },
      })
      .eq("id", sourceId);

    const response: IngestResponse = {
      received: rows.length,
      kept,
      rejected,
      source_id: sourceId,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("Ingest error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function parseCSV(text: string): CSVEstimateRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const rows: CSVEstimateRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const row: Record<string, string> = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });

    // Map to expected fields
    if (row.estimate_id && row.created_at && row.amount && row.status) {
      rows.push({
        estimate_id: row.estimate_id,
        created_at: row.created_at,
        closed_at: row.closed_at || null,
        updated_at: row.updated_at || null,
        amount: row.amount,
        status: row.status,
        job_type: row.job_type || undefined,
      });
    }
  }

  return rows;
}


