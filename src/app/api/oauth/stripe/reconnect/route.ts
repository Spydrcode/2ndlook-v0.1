import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getOrCreateInstallationId } from "@/lib/installations/cookie";
import { disconnectConnection } from "@/lib/oauth/connections";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const appUrl =
    process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

  try {
    const installationId = await getOrCreateInstallationId();
    try {
      await disconnectConnection(installationId, "stripe");
    } catch (error) {
      console.error("Stripe reconnect token clear error:", error);
    }

    return NextResponse.redirect(
      new URL("/api/oauth/stripe/start", appUrl)
    );
  } catch (error) {
    console.error("Stripe reconnect error:", error);
    return NextResponse.redirect(
      new URL("/dashboard/connect?error=oauth_start_failed", appUrl)
    );
  }
}
