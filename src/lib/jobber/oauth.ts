import { createAdminClient } from "@/lib/supabase/admin";
import { getConnection } from "@/lib/oauth/connections";
import { encrypt } from "@/lib/security/crypto";

export interface JobberTokens {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

/**
 * Refresh Jobber OAuth tokens
 * 
 * IMPORTANT: Jobber may rotate the refresh token on each refresh.
 * Always persist the new refresh_token if provided.
 */
export async function refreshJobberToken(
  installationId: string
): Promise<JobberTokens | null> {
  try {
    const connection = await getConnection(installationId, "jobber");

    if (!connection || !connection.refresh_token) {
      console.error("Failed to fetch OAuth connection");
      return null;
    }

    // Validate environment variables
    if (!process.env.JOBBER_CLIENT_ID || !process.env.JOBBER_CLIENT_SECRET) {
      console.error("Missing Jobber OAuth environment variables");
      return null;
    }

    // Request new tokens
    const response = await fetch("https://api.getjobber.com/api/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: connection.refresh_token,
        client_id: process.env.JOBBER_CLIENT_ID,
        client_secret: process.env.JOBBER_CLIENT_SECRET,
      }).toString(),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Token refresh failed:", response.status, errorData);
      return null;
    }

    const tokens = await response.json();
    const { access_token, refresh_token, expires_in } = tokens;

    if (!access_token) {
      console.error("No access_token in refresh response:", tokens);
      return null;
    }

    // Calculate expiration
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    // Update stored tokens (refresh_token may have rotated)
    const supabase = createAdminClient();
    const { error: updateError } = await supabase
      .from("oauth_connections")
      .update({
        access_token_enc: encrypt(access_token),
        refresh_token_enc: refresh_token
          ? encrypt(refresh_token)
          : encrypt(connection.refresh_token),
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("installation_id", installationId)
      .eq("provider", "jobber");

    if (updateError) {
      console.error("Failed to update tokens:", updateError);
      return null;
    }

    return {
      access_token,
      refresh_token: refresh_token || connection.refresh_token,
      expires_at: expiresAt,
    };
  } catch (err) {
    console.error("Token refresh error:", err);
    return null;
  }
}

/**
 * Get valid access token for Jobber API
 * 
 * Fetches current token and refreshes if expired.
 */
export async function getJobberAccessToken(
  installationId: string
): Promise<string | null> {
  try {
    const connection = await getConnection(installationId, "jobber");
    if (!connection) {
      console.error("Failed to fetch OAuth connection");
      return null;
    }

    // Check if token is expired (with 5min buffer)
    const expiresAt = connection.token_expires_at
      ? new Date(connection.token_expires_at)
      : null;
    const now = new Date();
    const bufferMs = 5 * 60 * 1000; // 5 minutes

    if (!expiresAt || expiresAt.getTime() - now.getTime() < bufferMs) {
      // Token expired or about to expire, refresh it
      const newTokens = await refreshJobberToken(installationId);
      if (!newTokens) {
        return null;
      }
      return newTokens.access_token;
    }

    return connection.access_token;
  } catch (err) {
    console.error("Get access token error:", err);
    return null;
  }
}


