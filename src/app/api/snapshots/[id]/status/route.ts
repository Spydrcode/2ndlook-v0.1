import { NextResponse } from "next/server";

import { getInstallationId } from "@/lib/installations/cookie";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: snapshotId } = await params;
  const installationId = await getInstallationId();
  if (!installationId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: snapshot, error } = await supabase.from("snapshots").select("*").eq("id", snapshotId).single();

  if (error || !snapshot) {
    return NextResponse.json({ ok: false, error: "Snapshot not found" }, { status: 404 });
  }

  const { data: source, error: sourceError } = await supabase
    .from("sources")
    .select("installation_id")
    .eq("id", snapshot.source_id)
    .single();

  if (sourceError || !source || source.installation_id !== installationId) {
    return NextResponse.json({ ok: false, error: "Not authorized" }, { status: 403 });
  }

  const errorMessage =
    typeof snapshot.error === "string"
      ? snapshot.error
      : typeof snapshot.error?.message === "string"
        ? snapshot.error.message
        : null;

  return NextResponse.json({
    ok: true,
    status: snapshot.status ?? "unknown",
    error: errorMessage,
    hasResult: snapshot.result !== null && snapshot.result !== undefined,
  });
}
