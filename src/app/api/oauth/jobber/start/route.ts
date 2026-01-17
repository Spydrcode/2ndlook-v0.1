import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getOrCreateInstallationId } from "@/lib/installations/cookie";
import { logJobberConnectionEvent } from "@/lib/jobber/connection-events";
import { getRequestedJobberScopes } from "@/lib/jobber/scopes";
import { disconnectConnection, getConnection } from "@/lib/oauth/connections";

import { randomBytes, randomUUID } from "node:crypto";
export const runtime = "nodejs";

/**
 * Jobber OAuth Start Route (NO-LOGIN MODE)
 * Initiates OAuth flow by redirecting to Jobber authorization endpoint
 * Uses installation_id instead of user authentication
 */
export async function GET(request: NextRequest) {
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const force = request.nextUrl.searchParams.get("force") === "1";
  try {
    // Get or create installation_id (no login required)
    const installationId = await getOrCreateInstallationId();
    const existingEventId = request.cookies.get("jobber_event_id")?.value;
    const eventId = existingEventId || randomUUID();

    // Validate required environment variables
    const clientId = process.env.JOBBER_CLIENT_ID;
    const redirectUri = process.env.JOBBER_REDIRECT_URI;
    const scopes = getRequestedJobberScopes();

    if (!clientId || !redirectUri) {
      console.error("Missing Jobber OAuth configuration");
      return NextResponse.redirect(new URL("/dashboard/connect?error=oauth_config_missing", appUrl));
    }

    if (!force) {
      try {
        const connection = await getConnection(installationId, "jobber");
        const needsReauth = connection?.metadata?.needs_reauth === true;
        const expiresAt = connection?.token_expires_at ? new Date(connection.token_expires_at) : null;
        const isExpired = expiresAt ? expiresAt.getTime() <= Date.now() : false;
        const isConnected = !!connection?.access_token && !isExpired;

        if (isConnected && !needsReauth) {
          const manageUrl = process.env.JOBBER_MANAGE_APP_URL;
          const redirectTo = manageUrl
            ? new URL(manageUrl, appUrl).toString()
            : new URL("/dashboard/connect?connected=jobber", appUrl).toString();

          try {
            await logJobberConnectionEvent({
              installationId,
              eventId,
              phase: "oauth_start",
              details: {
                force: false,
                skipped_oauth: true,
                reason: "already_connected",
                redirect_to: redirectTo,
              },
            });
          } catch (logError) {
            console.error("Failed to log Jobber OAuth start event:", logError);
          }

          return NextResponse.redirect(redirectTo);
        }
        if (needsReauth) {
          try {
            await disconnectConnection(installationId, "jobber");
          } catch (disconnectError) {
            console.error("Failed to clear Jobber tokens before reauth:", disconnectError);
          }
        }
      } catch (error) {
        console.error("Failed to validate Jobber connection:", error);
      }
    }

    if (force) {
      try {
        await disconnectConnection(installationId, "jobber");
      } catch (disconnectError) {
        console.error("Failed to clear Jobber tokens before forced reauth:", disconnectError);
      }
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
    authUrl.searchParams.set("prompt", force ? "login" : "consent");

    try {
      await logJobberConnectionEvent({
        installationId,
        eventId,
        phase: "oauth_start",
        details: {
          force,
          scopes,
          redirect_uri: redirectUri,
        },
      });
    } catch (logError) {
      console.error("Failed to log Jobber OAuth start event:", logError);
    }

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

    response.cookies.set("jobber_event_id", eventId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Jobber OAuth start error:", error);
    return NextResponse.redirect(new URL("/dashboard/connect?error=oauth_start_failed", appUrl));
  }
}
