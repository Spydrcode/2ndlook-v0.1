import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getInstallationId } from "@/lib/installations/cookie";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Jobber OAuth Status Route
 * Returns connection status for the current installation
 */
export async function GET(_request: NextRequest) {
  try {
    const installationId = await getInstallationId();

    if (!installationId) {
      return NextResponse.json({ connected: false, status: "no_installation" });
    }

    const supabase = createAdminClient();
    const { data: connection, error } = await supabase
      .from("oauth_connections")
      .select("access_token_enc, token_expires_at, external_account_id, metadata")
      .eq("installation_id", installationId)
      .eq("provider", "jobber")
      .single();

    if (error || !connection) {
      return NextResponse.json({ connected: false, status: "not_connected" });
    }

    const metadata = (connection.metadata as Record<string, unknown> | null) ?? null;
    if (metadata?.needs_reauth === true) {
      return NextResponse.json({
        connected: false,
        status: "needs_reauth",
        disconnected_reason: metadata?.needs_reauth_reason ?? null,
      });
    }

    if (!connection.access_token_enc) {
      return NextResponse.json({
        connected: false,
        status: "disconnected",
        disconnected_reason: metadata?.disconnected_reason ?? null,
      });
    }

    // Check if token is expired
    const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at) : null;
    const isExpired = expiresAt ? expiresAt.getTime() <= Date.now() : false;

    if (isExpired) {
      return NextResponse.json({
        connected: false,
        status: "token_expired",
        expires_at: connection.token_expires_at ?? null,
        disconnected_reason: metadata?.disconnected_reason ?? null,
      });
    }

    return NextResponse.json({
      connected: true,
      status: "connected",
      expires_at: connection.token_expires_at ?? null,
      external_account_id: connection.external_account_id ?? null,
      disconnected_reason: metadata?.disconnected_reason ?? null,
    });
  } catch (error) {
    console.error("Status check error:", error);
    return NextResponse.json({
      connected: false,
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
