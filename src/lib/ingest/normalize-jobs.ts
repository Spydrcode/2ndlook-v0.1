/**
 * Normalization for Jobber jobs ingestion.
 * Stores only signal fields (ids, dates, statuses, totals, client links).
 */

import type { JobNormalized, JobStatus } from "@/types/2ndlook";
import { MAX_JOB_RECORDS, WINDOW_DAYS } from "@/lib/config/limits";

export interface JobRowInput {
  job_id: string;
  created_at: string;
  start_at?: string | null;
  end_at?: string | null;
  job_status?: string | null;
  job_total?: number | string | null;
  client_id?: string | null;
}

export interface NormalizeJobsResult {
  kept: number;
  rejected: number;
}

const JOB_STATUS_ALIASES: Record<string, JobStatus> = {
  active: "active",
  scheduled: "active",
  requires_action: "active",
  action_required: "active",
  in_progress: "active",
  inprogress: "active",
  open: "active",
  completed: "completed",
  done: "completed",
  finished: "completed",
  cancelled: "cancelled",
  canceled: "cancelled",
  archived: "archived",
  converted: "converted",
};

function normalizeJobStatus(status?: string | null): JobStatus {
  if (!status) return "unknown";
  const normalized = status.trim().toLowerCase();
  return JOB_STATUS_ALIASES[normalized] ?? ("unknown" as JobStatus);
}

/**
 * Normalize and store jobs in the database.
 * Enforces 90-day activity window and max 100 records.
 */
export async function normalizeJobsAndStore(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  sourceId: string,
  rows: JobRowInput[]
): Promise<NormalizeJobsResult> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - WINDOW_DAYS);

  const normalized: Omit<JobNormalized, "id">[] = [];
  let rejected = 0;

  for (const row of rows) {
    const createdAt = new Date(row.created_at);
    const startAt = row.start_at ? new Date(row.start_at) : null;
    const endAt = row.end_at ? new Date(row.end_at) : null;

    if (Number.isNaN(createdAt.getTime())) {
      rejected++;
      continue;
    }

    const activityDate = startAt && !Number.isNaN(startAt.getTime()) ? startAt : createdAt;
    if (activityDate < cutoff) {
      rejected++;
      continue;
    }

    if (normalized.length >= MAX_JOB_RECORDS) {
      rejected++;
      continue;
    }

    const total =
      row.job_total === undefined || row.job_total === null
        ? null
        : Number.parseFloat(String(row.job_total).replace(/[^0-9.-]/g, ""));

    normalized.push({
      job_id: row.job_id,
      source_id: sourceId,
      created_at: createdAt.toISOString(),
      start_at: startAt && !Number.isNaN(startAt.getTime()) ? startAt.toISOString() : null,
      end_at: endAt && !Number.isNaN(endAt.getTime()) ? endAt.toISOString() : null,
      job_status: normalizeJobStatus(row.job_status),
      job_total: Number.isFinite(total) ? total : null,
      client_id: row.client_id || null,
    });
  }

  if (normalized.length > 0) {
    const { error } = await supabase.from("jobs_normalized").insert(normalized);
    if (error) {
      throw new Error(`Failed to insert jobs: ${error.message}`);
    }
  }

  return { kept: normalized.length, rejected };
}
