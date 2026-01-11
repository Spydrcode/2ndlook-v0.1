import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestJobberEstimates } from "@/lib/jobber/ingest";

/**
 * OAuth Callback Route for Jobber
 * 
 * Handles the OAuth redirect from Jobber with authorization code.
 * Validates state, exchanges code for tokens, persists credentials,
 * triggers ingestion, and redirects user to review page.
 */
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    // Handle OAuth error from Jobber
    if (error) {
      console.error("Jobber OAuth error:", error, errorDescription);
      return NextResponse.redirect(
        `${appUrl}/dashboard/connect?error=jobber_oauth_failed`
      );
    }

    // Validate required parameters
    if (!code) {
      return NextResponse.redirect(
        `${appUrl}/dashboard/connect?error=jobber_missing_code`
      );
    }

    if (!state) {
      return NextResponse.redirect(
        `${appUrl}/dashboard/connect?error=jobber_state_mismatch`
      );
    }

    // Validate state from cookie
    const cookieStore = await cookies();
    const storedState = cookieStore.get("jobber_oauth_state")?.value;
    const installationId = cookieStore.get("jobber_oauth_installation")?.value;
    
    console.log("[JOBBER CALLBACK] State validation:", {
      receivedState: state,
      storedState,
      installationId,
      allCookies: cookieStore.getAll().map(c => c.name)
    });

    if (!storedState || !installationId || storedState !== state) {
      console.error("[JOBBER CALLBACK] OAuth state mismatch or missing");
      return NextResponse.redirect(
        `${appUrl}/dashboard/connect?error=jobber_state_mismatch`
      );
    }

    // Clear state cookies
    cookieStore.delete("jobber_oauth_state");
    cookieStore.delete("jobber_oauth_installation");
    const supabase = createAdminClient();

    // Validate environment variables
    if (!process.env.JOBBER_CLIENT_ID || !process.env.JOBBER_CLIENT_SECRET || !process.env.JOBBER_REDIRECT_URI) {
      console.error("Missing Jobber OAuth environment variables");
      return NextResponse.redirect(
        `${appUrl}/dashboard/connect?error=jobber_config_error`
      );
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
      return NextResponse.redirect(
        `${appUrl}/dashboard/connect?error=jobber_token_exchange_failed`
      );
    }

    const tokens = await tokenResponse.json();
    console.log("Token response:", JSON.stringify(tokens, null, 2));
    const { access_token, refresh_token, expires_in } = tokens;

    if (!access_token || !refresh_token) {
      console.error("Missing tokens in response:", tokens);
      return NextResponse.redirect(
        `${appUrl}/dashboard/connect?error=jobber_invalid_tokens`
      );
    }

    // Calculate token expiration (default to 1 hour if expires_in not provided)
    const expiresInSeconds = typeof expires_in === "number" ? expires_in : 3600;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    // Store tokens in database
    const { error: dbError } = await supabase
      .from("oauth_connections")
      .upsert({
        installation_id: installationId,
        tool: "jobber",
        access_token,
        refresh_token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "installation_id,tool",
      });

    if (dbError) {
      console.error("Failed to store OAuth tokens:", dbError);
      return NextResponse.redirect(
        `${appUrl}/dashboard/connect?error=jobber_db_error`
      );
    }

    // Trigger ingestion
    console.log("[JOBBER CALLBACK] Starting Jobber ingestion for installation:", installationId);
    const ingestionResult = await ingestJobberEstimates(installationId);
    console.log("[JOBBER CALLBACK] Ingestion result:", JSON.stringify(ingestionResult, null, 2));

    if (!ingestionResult.success) {
      console.error("[JOBBER CALLBACK] Ingestion failed:", ingestionResult.error);
      
      // Check if it's a minimum estimates error
      if (ingestionResult.error?.includes("Minimum")) {
        return NextResponse.redirect(
          `${appUrl}/dashboard/connect?error=jobber_min_estimates`
        );
      }
      
      return NextResponse.redirect(
        `${appUrl}/dashboard/connect?error=jobber_ingest_failed`
      );
    }

    const sourceId = ingestionResult.source_id;

    // Redirect to review page with source ID
    return NextResponse.redirect(
      `${appUrl}/dashboard/review?source_id=${sourceId}&success=true`
    );
  } catch (err) {
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(
      `${appUrl}/dashboard/connect?error=jobber_unexpected_error`
    );
  }
}


