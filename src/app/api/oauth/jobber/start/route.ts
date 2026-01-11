import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getOrCreateInstallationId } from "@/lib/installations/cookie";
import { randomBytes } from "crypto";

/**
 * Jobber OAuth Start Route (NO-LOGIN MODE)
 * Initiates OAuth flow by redirecting to Jobber authorization endpoint
 * Uses installation_id instead of user authentication
 */
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  try {
    // Get or create installation_id (no login required)
    const installationId = await getOrCreateInstallationId();

    // Validate required environment variables
    const clientId = process.env.JOBBER_CLIENT_ID;
    const redirectUri = process.env.JOBBER_REDIRECT_URI;
    const scopes = process.env.JOBBER_SCOPES || "quotes:read";

    if (!clientId || !redirectUri) {
      console.error("Missing Jobber OAuth configuration");
      return NextResponse.redirect(
        new URL("/dashboard/connect?error=oauth_config_missing", appUrl)
      );
    }

    // Generate cryptographically random state
    const state = randomBytes(32).toString("hex");

    // Build Jobber authorization URL
    const authUrl = new URL("https://api.getjobber.com/api/oauth/authorize");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scopes);
    authUrl.searchParams.set("state", state);

    // Create response with redirect
    const response = NextResponse.redirect(authUrl.toString());

    // Store state in HttpOnly cookie (10 minute expiry)
    response.cookies.set("jobber_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
      path: "/",
    });

    // Store installation_id in cookie for callback (OAuth redirect needs this)
    response.cookies.set("jobber_oauth_installation", installationId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Jobber OAuth start error:", error);
    return NextResponse.redirect(
      new URL("/dashboard/connect?error=oauth_start_failed", appUrl)
    );
  }
}


