import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getInstallationId } from "@/lib/installations/cookie";
import { disconnectConnection } from "@/lib/oauth/connections";
import { logJobberConnectionEvent } from "@/lib/jobber/connection-events";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

/**
 * Jobber OAuth Disconnect Route
 * Clears stored tokens when user leaves page or refreshes
 */
export async function POST(_request: NextRequest) {
  try {
    const installationId = await getInstallationId();
    
    if (!installationId) {
      return NextResponse.json(
        { error: "No installation found" },
        { status: 400 }
      );
    }

    // Log disconnect event using a valid phase
    try {
      await logJobberConnectionEvent({
        installationId,
        eventId: randomUUID(),
        phase: "oauth_callback",
        details: {
          action: "disconnect",
          reason: "user_initiated",
          timestamp: new Date().toISOString(),
        },
      });
    } catch (logError) {
      console.error("Failed to log disconnect event:", logError);
    }

    // Disconnect the connection
    await disconnectConnection(installationId, "jobber");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Disconnect error:", error);
    return NextResponse.json(
      { error: "Failed to disconnect" },
      { status: 500 }
    );
  }
}
