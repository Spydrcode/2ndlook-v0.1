import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getInstallationId } from "@/lib/installations/cookie";
import { logJobberConnectionEvent } from "@/lib/jobber/connection-events";
import { appDisconnectJobber } from "@/lib/jobber/graphql";
import { getConnection, markConnectionDisconnected } from "@/lib/oauth/connections";

import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

/**
 * Jobber OAuth Disconnect Route
 * Hard disconnect: notifies Jobber and clears stored tokens
 */
export async function POST(_request: NextRequest) {
  try {
    const installationId = await getInstallationId();

    if (!installationId) {
      return NextResponse.json({ error: "No installation found" }, { status: 400 });
    }

    const connection = await getConnection(installationId, "jobber");

    if (!connection) {
      return NextResponse.json({ success: true });
    }

    if (connection?.access_token) {
      try {
        const result = await appDisconnectJobber(connection.access_token);
        if (result.userErrors && result.userErrors.length > 0) {
          console.warn("Jobber appDisconnect user errors:", result.userErrors);
        }
      } catch (disconnectError) {
        console.error("Jobber appDisconnect mutation failed:", disconnectError);
      }
    }

    // Log disconnect event
    try {
      await logJobberConnectionEvent({
        installationId,
        eventId: randomUUID(),
        phase: "disconnect",
        details: {
          action: "disconnect",
          reason: "user_initiated",
          timestamp: new Date().toISOString(),
        },
      });
    } catch (logError) {
      console.error("Failed to log disconnect event:", logError);
    }

    // Clear tokens locally after notifying Jobber
    await markConnectionDisconnected({
      installationId,
      provider: "jobber",
      reason: "user_initiated",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Disconnect error:", error);
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 });
  }
}
