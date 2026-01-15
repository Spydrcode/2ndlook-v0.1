import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getOrCreateInstallationId } from "@/lib/installations/cookie";
import { disconnectConnection } from "@/lib/oauth/connections";

export const runtime = "nodejs";

/**
 * Jobber OAuth Reconnect Route
 * Clears stored tokens and forces a fresh OAuth redirect.
 */
export async function GET(request: NextRequest) {
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

  try {
    const installationId = await getOrCreateInstallationId();
    try {
      await disconnectConnection(installationId, "jobber");
    } catch (error) {
      console.error("Jobber reconnect token clear error:", error);
    }

    return NextResponse.redirect(new URL("/api/oauth/jobber/start?force=1", appUrl));
  } catch (error) {
    console.error("Jobber reconnect error:", error);
    return NextResponse.redirect(new URL("/dashboard/connect?error=oauth_start_failed", appUrl));
  }
}
