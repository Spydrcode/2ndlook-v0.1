import { getRequiredJobberScopes, parseScopes } from "@/lib/jobber/scopes";
import { getConnection, markConnectionNeedsReauth } from "@/lib/oauth/connections";
import { encrypt } from "@/lib/security/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export type JobberTokenBundle = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  tokenVersion: number;
};

const DEFAULT_REFRESH_BUFFER_MS = 90 * 1000;
const refreshLocks = new Map<string, Promise<JobberTokenBundle | null>>();

function isNearExpiry(expiresAt: string | null, bufferMs: number): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() - Date.now() <= bufferMs;
}

function missingRequiredScopes(scopesRaw?: string | null): string[] {
  const granted = parseScopes(scopesRaw);
  return getRequiredJobberScopes().filter((scope) => !granted.has(scope));
}

function isInvalidRefreshTokenResponse(text: string): boolean {
  const msg = text.toLowerCase();
  return (
    (msg.includes("refresh token") && (msg.includes("invalid") || msg.includes("not valid"))) ||
    msg.includes("unexpected refresh token")
  );
}

type RefreshAttemptResult = {
  bundle: JobberTokenBundle | null;
  invalidRefresh: boolean;
  contention: boolean;
};

async function refreshWithOptimisticLock(params: {
  installationId: string;
  current: JobberTokenBundle;
  reason: string;
}): Promise<RefreshAttemptResult> {
  const { installationId, current, reason } = params;

  if (!process.env.JOBBER_CLIENT_ID || !process.env.JOBBER_CLIENT_SECRET) {
    console.error("[JOBBER TOKEN] Missing OAuth environment variables");
    return { bundle: null, invalidRefresh: false, contention: false };
  }

  if (!current.refreshToken) {
    console.warn("[JOBBER TOKEN] No refresh token available");
    return { bundle: null, invalidRefresh: false, contention: false };
  }

  console.info("[JOBBER TOKEN] Refresh attempt", {
    installation_id: installationId,
    reason,
    token_version: current.tokenVersion,
  });

  const response = await fetch("https://api.getjobber.com/api/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: current.refreshToken,
      client_id: process.env.JOBBER_CLIENT_ID,
      client_secret: process.env.JOBBER_CLIENT_SECRET,
    }).toString(),
  });

  const responseText = await response.text();
  if (!response.ok) {
    console.warn("[JOBBER TOKEN] Refresh failed", {
      installation_id: installationId,
      status: response.status,
    });

    if (isInvalidRefreshTokenResponse(responseText)) {
      console.warn("[JOBBER TOKEN] Invalid refresh token detected", {
        installation_id: installationId,
      });
      return { bundle: null, invalidRefresh: true, contention: false };
    }

    return { bundle: null, invalidRefresh: false, contention: false };
  }

  let json: { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string } | null = null;
  try {
    json = JSON.parse(responseText);
  } catch (_error) {
    console.error("[JOBBER TOKEN] Refresh response not JSON", {
      installation_id: installationId,
    });
    return { bundle: null, invalidRefresh: false, contention: false };
  }

  if (!json?.access_token || !json.refresh_token) {
    console.error("[JOBBER TOKEN] Refresh response missing tokens", {
      installation_id: installationId,
    });
    return { bundle: null, invalidRefresh: false, contention: false };
  }

  const expiresInSeconds = typeof json.expires_in === "number" ? json.expires_in : 3600;
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

  const supabase = createAdminClient();
  const { data: updated, error } = await supabase
    .from("oauth_connections")
    .update({
      access_token_enc: encrypt(json.access_token),
      refresh_token_enc: encrypt(json.refresh_token),
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
      token_version: current.tokenVersion + 1,
    })
    .eq("installation_id", installationId)
    .eq("provider", "jobber")
    .eq("token_version", current.tokenVersion)
    .select("token_version")
    .single();

  if (error || !updated) {
    console.warn("[JOBBER TOKEN] Refresh contention", {
      installation_id: installationId,
      token_version: current.tokenVersion,
    });
    return { bundle: null, invalidRefresh: false, contention: true };
  }

  console.info("[JOBBER TOKEN] Refresh success", {
    installation_id: installationId,
    token_version: updated.token_version,
    expires_at: expiresAt,
  });

  return {
    bundle: {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt,
      tokenVersion: updated.token_version ?? current.tokenVersion + 1,
    },
    invalidRefresh: false,
    contention: false,
  };
}

async function loadLatestTokens(installationId: string): Promise<JobberTokenBundle | null> {
  const connection = await getConnection(installationId, "jobber");
  if (!connection || !connection.access_token) return null;
  if (connection.metadata?.needs_reauth === true) return null;
  return {
    accessToken: connection.access_token,
    refreshToken: connection.refresh_token ?? null,
    expiresAt: connection.token_expires_at ?? null,
    tokenVersion: connection.token_version ?? 0,
  };
}

export async function getJobberTokens(
  installationId: string,
  opts?: { forceRefresh?: boolean; refreshBufferMs?: number },
): Promise<JobberTokenBundle | null> {
  const connection = await getConnection(installationId, "jobber");
  if (!connection) return null;

  const needsReauth = connection.metadata?.needs_reauth === true;
  console.info("[JOBBER TOKEN] Token read", {
    installation_id: installationId,
    expires_at: connection.token_expires_at ?? null,
    needs_reauth: needsReauth,
    token_version: connection.token_version ?? 0,
  });

  if (needsReauth) return null;

  const missingScopes = missingRequiredScopes(connection.scopes);
  if (missingScopes.length > 0) {
    await markConnectionNeedsReauth({
      installationId,
      provider: "jobber",
      reason: "missing_required_scopes",
      details: { missing_scopes: missingScopes },
    });
    return null;
  }

  if (!connection.access_token) return null;

  const bufferMs = opts?.refreshBufferMs ?? DEFAULT_REFRESH_BUFFER_MS;
  const shouldRefresh = opts?.forceRefresh || isNearExpiry(connection.token_expires_at ?? null, bufferMs);

  if (!shouldRefresh) {
    return {
      accessToken: connection.access_token,
      refreshToken: connection.refresh_token ?? null,
      expiresAt: connection.token_expires_at ?? null,
      tokenVersion: connection.token_version ?? 0,
    };
  }
  if (!connection.refresh_token) {
    await markConnectionNeedsReauth({
      installationId,
      provider: "jobber",
      reason: "missing_refresh_token",
    });
    return null;
  }

  const lockKey = installationId;
  const existing = refreshLocks.get(lockKey);
  if (existing) {
    return existing;
  }

  const refreshPromise = (async () => {
    const current: JobberTokenBundle = {
      accessToken: connection.access_token,
      refreshToken: connection.refresh_token ?? null,
      expiresAt: connection.token_expires_at ?? null,
      tokenVersion: connection.token_version ?? 0,
    };

    const refreshed = await refreshWithOptimisticLock({
      installationId,
      current,
      reason: opts?.forceRefresh ? "force_refresh" : "near_expiry",
    });

    if (refreshed.bundle) {
      return refreshed.bundle;
    }

    const latest = await loadLatestTokens(installationId);
    const latestChanged =
      latest &&
      (latest.tokenVersion !== current.tokenVersion ||
        latest.refreshToken !== current.refreshToken ||
        latest.accessToken !== current.accessToken);

    if (latest) {
      const latestExpired = isNearExpiry(latest.expiresAt ?? null, bufferMs);
      if (!latestExpired) {
        console.info("[JOBBER TOKEN] Using latest tokens after refresh attempt", {
          installation_id: installationId,
          token_version: latest.tokenVersion,
        });
        return latest;
      }
    }

    if (latest && latestChanged && latest.refreshToken) {
      const secondRefresh = await refreshWithOptimisticLock({
        installationId,
        current: latest,
        reason: refreshed.invalidRefresh ? "self_heal" : "contention_retry",
      });
      if (secondRefresh.bundle) {
        return secondRefresh.bundle;
      }
    }

    await markConnectionNeedsReauth({
      installationId,
      provider: "jobber",
      reason: refreshed.invalidRefresh ? "refresh_token_invalid" : "refresh_failed",
    });
    return null;
  })();

  refreshLocks.set(lockKey, refreshPromise);

  try {
    return await refreshPromise;
  } finally {
    refreshLocks.delete(lockKey);
  }
}
