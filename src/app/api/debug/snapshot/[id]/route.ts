import { NextResponse } from "next/server";

import { getInstallationId } from "@/lib/installations/cookie";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: snapshotId } = await params;
  const installationId = await getInstallationId();
  const supabase = createAdminClient();

  const { data: snapshot, error } = await supabase
    .from("snapshots")
    .select("id, source_id, status, estimate_count, confidence_level, generated_at")
    .eq("id", snapshotId)
    .single();

  if (error || !snapshot) {
    return NextResponse.json({
      exists: false,
      snapshot_id: snapshotId,
      error: error?.message ?? "not_found",
    });
  }

  let sourceInfo: { id: string | null; installation_id: string | null } = {
    id: null,
    installation_id: null,
  };

  if (snapshot.source_id) {
    const { data: source } = await supabase
      .from("sources")
      .select("id, installation_id")
      .eq("id", snapshot.source_id)
      .single();

    sourceInfo = {
      id: source?.id ?? null,
      installation_id: source?.installation_id ?? null,
    };
  }

  return NextResponse.json({
    exists: true,
    snapshot,
    source: sourceInfo,
    installation_id_cookie: installationId,
    installation_match: !!installationId && installationId === sourceInfo.installation_id,
  });
}
