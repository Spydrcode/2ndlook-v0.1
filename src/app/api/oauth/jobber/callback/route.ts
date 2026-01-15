import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { upsertConnection } from "@/lib/oauth/connections";
import { ingestJobberEstimates } from "@/lib/jobber/ingest";
import { allowSmallDatasets, MIN_MEANINGFUL_ESTIMATES_PROD } from "@/lib/config/limits";
import { logJobberConnectionEvent } from "@/lib/jobber/connection-events";
import { randomUUID } from "crypto";
export const runtime = "nodejs";

/**
 * OAuth Callback Route for Jobber
 * 
 * Handles the OAuth redirect from Jobber with authorization code.
 * Validates state, exchanges code for tokens, persists credentials,
 * triggers ingestion, and redirects user to review page.
 */
export async function GET(request: NextRequest) {
  const appUrl =
    process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  
  // Helper to create error response with cookie cleanup
  const errorResponse = (errorCode: string, eventId?: string) => {
    const url = new URL(`${appUrl}/dashboard/connect`);
    url.searchParams.set("error", errorCode);
    if (eventId) url.searchParams.set("event_id", eventId);

    const response = NextResponse.redirect(url.toString());
    response.cookies.delete("jobber_oauth_state");
    response.cookies.delete("jobber_oauth_installation");
    response.cookies.delete("jobber_event_id");
    return response;
  };
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    const cookieStore = await cookies();
    const storedState = cookieStore.get("jobber_oauth_state")?.value;
    const installationId = cookieStore.get("jobber_oauth_installation")?.value;
    const eventId = cookieStore.get("jobber_event_id")?.value ?? randomUUID();

    const logEvent = async (
      phase: Parameters<typeof logJobberConnectionEvent>[0]["phase"],
      details?: Record<string, unknown>
    ) => {
      if (!installationId) return;
      try {
        await logJobberConnectionEvent({
          installationId,
          eventId,
          phase,
          details,
        });
      } catch (logError) {
        console.error("Failed to log Jobber OAuth event:", logError);
      }
    };

    // Handle OAuth error from Jobber
    if (error) {
      console.error("Jobber OAuth error:", error, errorDescription);
      await logEvent("oauth_callback", {
        error,
        error_description: errorDescription,
        has_code: !!code,
        has_state: !!state,
      });
      return errorResponse("jobber_oauth_failed");
    }

    // Validate required parameters
    if (!code) {
      await logEvent("oauth_callback", {
        error: "missing_code",
        has_state: !!state,
      });
      return errorResponse("jobber_missing_code");
    }

    if (!state) {
      await logEvent("oauth_callback", {
        error: "missing_state",
        has_code: true,
      });
      return errorResponse("jobber_state_mismatch");
    }

    // Validate state from cookie
    if (!storedState || !installationId || storedState !== state) {
      console.error("[JOBBER CALLBACK] OAuth state mismatch or missing");
      await logEvent("oauth_callback", {
        error: "state_mismatch",
        has_code: true,
        has_state: true,
        stored_state_present: !!storedState,
        state_match: storedState === state,
      });
      return errorResponse("jobber_state_mismatch");
    }

    // Clear state cookies
    cookieStore.delete("jobber_oauth_state");
    cookieStore.delete("jobber_oauth_installation");
    cookieStore.delete("jobber_event_id");

    await logEvent("oauth_callback", {
      ok: true,
      has_code: true,
      has_state: true,
    });

    // Validate environment variables
    if (!process.env.JOBBER_CLIENT_ID || !process.env.JOBBER_CLIENT_SECRET || !process.env.JOBBER_REDIRECT_URI) {
      console.error("Missing Jobber OAuth environment variables");
      await logEvent("oauth_callback", {
        error: "config_missing",
      });
      return errorResponse("jobber_config_error");
    }

    // Exchange authorization code for tokens
    const tokenResponse = await fetch("https://api.getjobber.com/api/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: process.env.JOBBER_CLIENT_ID,
        client_secret: process.env.JOBBER_CLIENT_SECRET,
        redirect_uri: process.env.JOBBER_REDIRECT_URI,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error("Token exchange failed:", tokenResponse.status, errorData);
      await logEvent("token_exchange", {
        ok: false,
        status: tokenResponse.status,
        error: errorData,
      });
      return errorResponse("jobber_token_exchange_failed");
    }

    const tokens = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokens;

    if (!access_token || !refresh_token) {
      console.error("Missing tokens in response:", tokens);
      await logEvent("token_exchange", {
        ok: false,
        status: tokenResponse.status,
        error: "missing_tokens",
      });
      return errorResponse("jobber_invalid_tokens");
    }

    await logEvent("token_exchange", {
      ok: true,
      status: tokenResponse.status,
    });

    // Calculate token expiration (default to 1 hour if expires_in not provided)
    const expiresInSeconds = typeof expires_in === "number" ? expires_in : 3600;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    // Store tokens in database
    try {
      await upsertConnection({
        installationId,
        provider: "jobber",
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt: expiresAt,
        scopes: process.env.JOBBER_SCOPES || null,
        metadata: { granted_at: new Date().toISOString() },
      });
    } catch (dbError) {
      console.error("Failed to store OAuth tokens:", dbError);
      await logEvent("token_exchange", {
        ok: false,
        error: "db_error",
      });
      return errorResponse("jobber_db_error");
    }

    // Trigger ingestion
    console.log("[JOBBER CALLBACK] Starting Jobber ingestion for installation:", installationId);
    await logEvent("ingest_start", { installation_id: installationId });
    const ingestionResult = await ingestJobberEstimates(installationId, eventId);
    console.log("[JOBBER CALLBACK] Ingestion result:", JSON.stringify(ingestionResult, null, 2));

    if (!ingestionResult.success) {
      console.error("[JOBBER CALLBACK] Ingestion failed:", ingestionResult.error);

      return errorResponse("jobber_ingest_failed", eventId);
    }

    const sourceId = ingestionResult.source_id;

    if (
      allowSmallDatasets() &&
      (ingestionResult.meaningful_estimates || 0) < MIN_MEANINGFUL_ESTIMATES_PROD
    ) {
      // Clear OAuth cookies on completion
      const response = NextResponse.redirect(
        `${appUrl}/dashboard/review?source_id=${sourceId}&notice=insufficient_data`
      );
      response.cookies.delete("jobber_oauth_state");
      response.cookies.delete("jobber_oauth_installation");
      response.cookies.delete("jobber_event_id");
      return response;
    }

    // Clear OAuth cookies on successful completion
    const response = NextResponse.redirect(
      `${appUrl}/dashboard/review?source_id=${sourceId}&success=true`
    );
    response.cookies.delete("jobber_oauth_state");
    response.cookies.delete("jobber_oauth_installation");
    response.cookies.delete("jobber_event_id");
    return response;
  } catch (err) {
    console.error("OAuth callback error:", err);
    return errorResponse("jobber_unexpected_error");
  }
}
