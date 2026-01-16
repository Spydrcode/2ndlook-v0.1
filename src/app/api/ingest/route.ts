import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { WINDOW_DAYS } from "@/lib/config/limits";
import { sanitizeCity, sanitizeMoney, sanitizePostal } from "@/lib/connectors/sanitize";
import type { CanonicalEstimate, ConnectorPayload } from "@/lib/connectors/types";
import { runIngestFromPayload } from "@/lib/ingest/runIngest";
import { getOrCreateInstallationId } from "@/lib/installations/cookie";
import { createAdminClient } from "@/lib/supabase/admin";
import type { IngestResponse } from "@/types/2ndlook";

export async function POST(request: NextRequest) {
  try {
    const installationId = await getOrCreateInstallationId();
    const supabase = createAdminClient();

    // Parse form data
    const formData = await request.formData();
    const sourceId = formData.get("source_id") as string;
    const file = formData.get("file") as File;

    if (!sourceId || !file) {
      return NextResponse.json({ error: "source_id and file are required" }, { status: 400 });
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
      return NextResponse.json({ error: "No valid rows found in CSV" }, { status: 400 });
    }

    const payload: ConnectorPayload = {
      kind: "file",
      generated_at: new Date().toISOString(),
      window_days: WINDOW_DAYS,
      limits: {
        max_estimates: 100,
        max_invoices: 0,
        max_clients: 0,
        max_jobs: 0,
      },
      clients: [],
      invoices: [],
      jobs: [],
      estimates: rows,
    };

    const { kept, rejected, meaningful } = await runIngestFromPayload(payload, installationId, {
      sourceId,
      sourceName: "File Upload",
      supabase,
    });

    const response: IngestResponse = {
      received: rows.length,
      kept,
      rejected,
      source_id: sourceId,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("Ingest error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function parseCSV(text: string): CanonicalEstimate[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const rows: CanonicalEstimate[] = [];

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
        amount: sanitizeMoney(row.amount),
        status: row.status,
        job_type: row.job_type || null,
        client_id: row.client_id || null,
        job_id: row.job_id || null,
        geo_city: sanitizeCity(row.geo_city),
        geo_postal: sanitizePostal(row.geo_postal),
      });
    }
  }

  return rows;
}
