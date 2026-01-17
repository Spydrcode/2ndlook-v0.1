import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getOrCreateInstallationId } from "@/lib/installations/cookie";
import { createSnapshotRecord } from "@/lib/snapshot/createSnapshot";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SnapshotRequest, SnapshotResponse } from "@/types/2ndlook";

function isSnapshotSchemaMismatch(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return (
    lower.includes('column "status"') ||
    lower.includes('column "input_summary"') ||
    lower.includes('column "error"') ||
    lower.includes('null value in column "result"') ||
    lower.includes("snapshots_status_check") ||
    lower.includes("snapshots_estimate_count_check")
  );
}

export async function POST(request: NextRequest) {
  try {
    const installationId = await getOrCreateInstallationId();
    const supabase = createAdminClient();

    const body: SnapshotRequest = await request.json();
    const { source_id } = body;

    if (!source_id) {
      return NextResponse.json({ error: "source_id is required" }, { status: 400 });
    }

    // Verify source ownership
    const { data: source, error: sourceError } = await supabase
      .from("sources")
      .select("id, installation_id, status")
      .eq("id", source_id)
      .single();

    if (sourceError || !source || source.installation_id !== installationId) {
      return NextResponse.json({ error: "Invalid source_id" }, { status: 403 });
    }

    if (source.status !== "bucketed" && source.status !== "insufficient_data") {
      return NextResponse.json({ error: "Source must be bucketed before snapshot generation" }, { status: 400 });
    }

    let snapshot_id: string;

    try {
      const created = await createSnapshotRecord({
        installationId,
        sourceId: source_id,
      });
      snapshot_id = created.snapshot_id;
    } catch (createError) {
      if (isSnapshotSchemaMismatch(createError)) {
        console.warn("[Snapshot API] Snapshot schema mismatch; falling back to deterministic snapshot.", {
          source_id,
          error: createError instanceof Error ? createError.message : "unknown",
        });

        const { runDeterministicSnapshot } = await import("@/lib/snapshot/deterministic");
        const result = await runDeterministicSnapshot({
          source_id,
          installation_id: installationId,
        });
        snapshot_id = result.snapshot_id;

        return NextResponse.json({ snapshot_id }, { status: 200 });
      }

      throw createError;
    }

    await supabase.from("snapshots").update({ status: "queued" }).eq("id", snapshot_id);

    void import("@/lib/snapshot/runSnapshotJob")
      .then(({ runSnapshotJob }) => runSnapshotJob(snapshot_id))
      .catch(async (jobError) => {
        console.error("[Snapshot API] Failed to trigger snapshot job:", {
          snapshot_id,
          error: jobError instanceof Error ? jobError.message : "unknown",
        });

        await supabase
          .from("snapshots")
          .update({
            status: "failed",
            error: { message: jobError instanceof Error ? jobError.message : "snapshot_job_failed" },
            completed_at: new Date().toISOString(),
          })
          .eq("id", snapshot_id);
      });

    const response: SnapshotResponse = {
      snapshot_id,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("[Snapshot API] Fatal error:", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json({ error: "Unable to generate snapshot. Please try again." }, { status: 500 });
  }
}
