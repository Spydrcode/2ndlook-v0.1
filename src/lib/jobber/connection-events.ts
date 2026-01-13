import "server-only";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export type JobberConnectionPhase =
  | "oauth_start"
  | "oauth_callback"
  | "token_exchange"
  | "ingest_start"
  | "ingest_error"
  | "ingest_success";

export async function logJobberConnectionEvent(params: {
  installationId: string;
  eventId?: string;
  userId?: string | null;
  phase: JobberConnectionPhase;
  details?: Record<string, unknown> | null;
}): Promise<string> {
  const supabase = createAdminClient();
  const eventId = params.eventId ?? randomUUID();

  const { error } = await supabase.from("jobber_connection_events").insert({
    event_id: eventId,
    installation_id: params.installationId,
    user_id: params.userId ?? null,
    phase: params.phase,
    details: params.details ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }

  return eventId;
}
