import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInstallationId } from "@/lib/installations/cookie";

export const runtime = "nodejs";

export async function GET(_request: NextRequest) {
  const installationId = await getInstallationId();
  if (!installationId) {
    return NextResponse.json({
      installation_id: null,
      last_sync_status: null,
      last_error_message: null,
      last_event_id: null,
      last_event_phase: null,
      last_event_at: null,
    });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("jobber_connection_events")
    .select("event_id, phase, details, created_at")
    .eq("installation_id", installationId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) {
    return NextResponse.json({
      installation_id: installationId,
      last_sync_status: null,
      last_error_message: null,
      last_event_id: null,
      last_event_phase: null,
      last_event_at: null,
    });
  }

  const events = data as Array<{
    event_id: string;
    phase: string;
    details: Record<string, unknown> | null;
    created_at: string;
  }>;

  const lastSyncEvent = events.find(
    (event) => event.phase === "ingest_success" || event.phase === "ingest_error"
  );
  const lastErrorEvent = events.find((event) => {
    if (event.phase === "ingest_error") return true;
    const details = event.details || {};
    if (details && typeof details.error === "string") return true;
    if (details && details.ok === false) return true;
    return false;
  });
  const lastEvent = events[0];

  const lastSyncStatus =
    lastSyncEvent?.phase === "ingest_success"
      ? "success"
      : lastSyncEvent?.phase === "ingest_error"
        ? "fail"
        : null;

  const lastErrorDetails = lastErrorEvent?.details || null;
  const lastErrorMessage =
    (lastErrorDetails && typeof lastErrorDetails.error === "string" && lastErrorDetails.error) ||
    (lastErrorDetails && typeof lastErrorDetails.message === "string" && lastErrorDetails.message) ||
    null;

  return NextResponse.json({
    installation_id: installationId,
    last_sync_status: lastSyncStatus,
    last_error_message: lastErrorMessage,
    last_event_id:
      lastErrorEvent?.event_id || lastSyncEvent?.event_id || lastEvent?.event_id || null,
    last_event_phase: lastEvent?.phase ?? null,
    last_event_at: lastEvent?.created_at ?? null,
  });
}
