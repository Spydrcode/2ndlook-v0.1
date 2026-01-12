import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInstallationId } from "@/lib/installations/cookie";

export const runtime = "nodejs";

function isAuthorized(request: NextRequest): boolean {
  const token = process.env.DEBUG_ADMIN_TOKEN;
  if (process.env.NODE_ENV !== "production" && !token) {
    return true;
  }
  if (!token) {
    return false;
  }
  const authHeader = request.headers.get("authorization") || "";
  return authHeader === `Bearer ${token}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const installationId = await getInstallationId();
  if (!installationId) {
    return NextResponse.json({ installation_id: null, connections: [] });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("oauth_connections")
    .select(
      "provider, token_expires_at, refresh_token_enc, external_account_id, updated_at, access_token_enc"
    )
    .eq("installation_id", installationId);

  if (error || !data) {
    return NextResponse.json({ installation_id: installationId, connections: [] });
  }

  const connections = data.map((row) => ({
    provider: row.provider,
    connected: !!row.access_token_enc,
    token_expires_at: row.token_expires_at ?? null,
    has_refresh_token: !!row.refresh_token_enc,
    external_account_id: row.external_account_id ?? null,
    updated_at: row.updated_at ?? null,
  }));

  return NextResponse.json({ installation_id: installationId, connections });
}
