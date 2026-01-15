import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getInstallationId } from "@/lib/installations/cookie";
import { getConnection } from "@/lib/oauth/connections";

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

    const connection = await getConnection(installationId, "jobber");

    if (!connection) {
      return NextResponse.json({ connected: false, status: "not_connected" });
    }

    // Check if token is expired
    const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at) : null;
    const isExpired = expiresAt ? expiresAt.getTime() <= Date.now() : false;

    if (isExpired) {
      return NextResponse.json({
        connected: false,
        status: "token_expired",
        expires_at: connection.token_expires_at,
      });
    }

    return NextResponse.json({
      connected: true,
      status: "connected",
      expires_at: connection.token_expires_at,
      external_account_id: connection.external_account_id,
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
