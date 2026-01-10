import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { IngestResponse, CSVEstimateRow, EstimateNormalized } from "@/types/2ndlook";

// Dataset constraints (LOCKED)
const MIN_ESTIMATES = 25;
const MAX_ESTIMATES = 100;
const MAX_DAYS = 90;

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
      .select("id, user_id")
      .eq("id", sourceId)
      .single();

    if (sourceError || !source || source.user_id !== user.id) {
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
    const { kept, rejected } = await normalizeAndStore(supabase, sourceId, rows);

    // Enforce minimum constraint
    if (kept < MIN_ESTIMATES) {
      // Rollback: delete inserted estimates
      await supabase
        .from("estimates_normalized")
        .delete()
        .eq("source_id", sourceId);

      return NextResponse.json(
        {
          error: `Minimum ${MIN_ESTIMATES} closed estimates required. Found: ${kept}`,
        },
        { status: 400 }
      );
    }

    // Update source status
    await supabase
      .from("sources")
      .update({ status: "ingested" })
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
    if (
      row.estimate_id &&
      row.created_at &&
      row.closed_at &&
      row.amount &&
      row.status
    ) {
      rows.push({
        estimate_id: row.estimate_id,
        created_at: row.created_at,
        closed_at: row.closed_at,
        amount: row.amount,
        status: row.status,
        job_type: row.job_type || undefined,
      });
    }
  }

  return rows;
}

async function normalizeAndStore(
  supabase: any,
  sourceId: string,
  rows: CSVEstimateRow[]
): Promise<{ kept: number; rejected: number }> {
  const now = new Date();
  const cutoffDate = new Date(now.getTime() - MAX_DAYS * 24 * 60 * 60 * 1000);

  const normalized: Omit<EstimateNormalized, "id">[] = [];
  let rejected = 0;

  for (const row of rows) {
    // Enforce: closed or accepted only
    const status = row.status.toLowerCase();
    if (status !== "closed" && status !== "accepted") {
      rejected++;
      continue;
    }

    // Parse dates
    const createdAt = new Date(row.created_at);
    const closedAt = new Date(row.closed_at);

    if (isNaN(createdAt.getTime()) || isNaN(closedAt.getTime())) {
      rejected++;
      continue;
    }

    // Enforce: within 90 days
    if (closedAt < cutoffDate) {
      rejected++;
      continue;
    }

    // Enforce: valid amount
    const amount = parseFloat(String(row.amount).replace(/[^0-9.-]/g, ""));
    if (isNaN(amount) || amount < 0) {
      rejected++;
      continue;
    }

    // Enforce: max 100 estimates
    if (normalized.length >= MAX_ESTIMATES) {
      rejected++;
      continue;
    }

    normalized.push({
      estimate_id: row.estimate_id,
      source_id: sourceId,
      created_at: createdAt.toISOString(),
      closed_at: closedAt.toISOString(),
      amount,
      status: status as "closed" | "accepted",
      job_type: row.job_type || undefined,
    });
  }

  // Bulk insert
  if (normalized.length > 0) {
    const { error } = await supabase
      .from("estimates_normalized")
      .insert(normalized);

    if (error) {
      throw new Error(`Failed to insert estimates: ${error.message}`);
    }
  }

  return {
    kept: normalized.length,
    rejected: rejected + (rows.length - normalized.length - rejected),
  };
}
