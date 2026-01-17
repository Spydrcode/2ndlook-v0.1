import "server-only";

import type { OAuthProviderTool } from "@/lib/oauth/providers";
import { decrypt, encrypt } from "@/lib/security/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export interface OAuthConnection {
  installation_id: string;
  provider: OAuthProviderTool;
  access_token: string;
  refresh_token?: string | null;
  token_expires_at?: string | null;
  scopes?: string | null;
  external_account_id?: string | null;
  token_version?: number | null;
  metadata?: Record<string, unknown> | null;
}

export class TokenDecryptError extends Error {
  constructor(message = "token_decrypt_failed") {
    super(message);
    this.name = "TokenDecryptError";
  }
}

function safeDecrypt(value: string): string {
  try {
    return decrypt(value);
  } catch (error) {
    throw new TokenDecryptError(error instanceof Error ? error.message : "token_decrypt_failed");
  }
}

export async function upsertConnection(params: {
  installationId: string;
  provider: OAuthProviderTool | "jobber";
  accessToken: string;
  refreshToken?: string | null;
  tokenExpiresAt?: string | null;
  scopes?: string | null;
  externalAccountId?: string | null;
  tokenVersion?: number | null;
  metadata?: Record<string, unknown> | null;
}) {
  const supabase = createAdminClient();
  const accessTokenEnc = encrypt(params.accessToken);
  const refreshTokenEnc = params.refreshToken ? encrypt(params.refreshToken) : null;

  const payload: Record<string, unknown> = {
    installation_id: params.installationId,
    provider: params.provider,
    access_token_enc: accessTokenEnc,
    refresh_token_enc: refreshTokenEnc,
    token_expires_at: params.tokenExpiresAt ?? null,
    scopes: params.scopes ?? null,
    external_account_id: params.externalAccountId ?? null,
    metadata: params.metadata ?? null,
    updated_at: new Date().toISOString(),
  };

  if (params.tokenVersion !== undefined && params.tokenVersion !== null) {
    payload.token_version = params.tokenVersion;
  }

  const { error } = await supabase.from("oauth_connections").upsert(payload, {
    onConflict: "installation_id,provider",
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function getConnection(
  installationId: string,
  provider: OAuthProviderTool | "jobber",
): Promise<OAuthConnection | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("oauth_connections")
    .select(
      "installation_id, provider, access_token_enc, refresh_token_enc, token_expires_at, scopes, external_account_id, token_version, metadata",
    )
    .eq("installation_id", installationId)
    .eq("provider", provider)
    .single();

  if (error || !data) {
    return null;
  }

  if (!data.access_token_enc) {
    return null;
  }

  return {
    installation_id: data.installation_id,
    provider: data.provider,
    access_token: safeDecrypt(data.access_token_enc),
    refresh_token: data.refresh_token_enc ? safeDecrypt(data.refresh_token_enc) : null,
    token_expires_at: data.token_expires_at ?? null,
    scopes: data.scopes ?? null,
    external_account_id: data.external_account_id ?? null,
    token_version: data.token_version ?? null,
    metadata: (data.metadata as Record<string, unknown>) ?? null,
  };
}

export async function requireConnection(
  installationId: string,
  provider: OAuthProviderTool | "jobber",
): Promise<OAuthConnection> {
  const connection = await getConnection(installationId, provider);
  if (!connection) {
    throw new Error("oauth_connection_missing");
  }
  return connection;
}

export async function disconnectConnection(
  installationId: string,
  provider: OAuthProviderTool | "jobber",
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("oauth_connections")
    .delete()
    .eq("installation_id", installationId)
    .eq("provider", provider);

  if (error) {
    throw new Error(error.message);
  }
}

export async function updateConnectionMetadata(params: {
  installationId: string;
  provider: OAuthProviderTool | "jobber";
  patch: Record<string, unknown>;
}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("oauth_connections")
    .select("metadata")
    .eq("installation_id", params.installationId)
    .eq("provider", params.provider)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const next = { ...(data?.metadata as Record<string, unknown> | null), ...params.patch };
  const { error: updateError } = await supabase
    .from("oauth_connections")
    .update({ metadata: next, updated_at: new Date().toISOString() })
    .eq("installation_id", params.installationId)
    .eq("provider", params.provider);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

export async function markConnectionNeedsReauth(params: {
  installationId: string;
  provider: OAuthProviderTool | "jobber";
  reason: string;
  details?: Record<string, unknown> | null;
}) {
  await updateConnectionMetadata({
    installationId: params.installationId,
    provider: params.provider,
    patch: {
      needs_reauth: true,
      needs_reauth_reason: params.reason,
      needs_reauth_at: new Date().toISOString(),
      ...(params.details ?? {}),
    },
  });
}

export async function markConnectionDisconnected(params: {
  installationId: string;
  provider: OAuthProviderTool | "jobber";
  reason: string;
  details?: Record<string, unknown> | null;
}) {
  const supabase = createAdminClient();
  const { data, error: readError } = await supabase
    .from("oauth_connections")
    .select("metadata")
    .eq("installation_id", params.installationId)
    .eq("provider", params.provider)
    .single();

  if (readError) {
    throw new Error(readError.message);
  }

  const metadata = {
    ...(data?.metadata as Record<string, unknown> | null),
    disconnected_reason: params.reason,
    disconnected_at: new Date().toISOString(),
    ...(params.details ?? {}),
  };

  const { error } = await supabase
    .from("oauth_connections")
    .update({
      access_token_enc: null,
      refresh_token_enc: null,
      token_expires_at: null,
      scopes: null,
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq("installation_id", params.installationId)
    .eq("provider", params.provider);

  if (error) {
    throw new Error(error.message);
  }
}

export async function refreshIfNeeded(): Promise<never> {
  throw new Error("oauth_refresh_not_implemented");
}

export async function listConnectionStatuses(installationId: string): Promise<
  Array<{
    provider: string;
    status: "connected" | "reconnect_required";
    token_expires_at: string | null;
    has_refresh_token: boolean;
    external_account_id: string | null;
    updated_at: string | null;
  }>
> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("oauth_connections")
    .select(
      "provider, access_token_enc, refresh_token_enc, token_expires_at, external_account_id, updated_at, metadata",
    )
    .eq("installation_id", installationId);

  if (error || !data) {
    return [];
  }

  return data.map((row) => {
    let status: "connected" | "reconnect_required" = "connected";
    const metadata = (row.metadata as Record<string, unknown> | null) ?? null;
    const needsReauth = metadata?.needs_reauth === true;

    if (!row.access_token_enc) {
      status = "reconnect_required";
    } else {
      try {
        safeDecrypt(row.access_token_enc);
      } catch (err) {
        if (err instanceof TokenDecryptError) {
          status = "reconnect_required";
        } else {
          status = "reconnect_required";
        }
      }
    }

    const expiresAt = row.token_expires_at ? new Date(row.token_expires_at) : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      status = "reconnect_required";
    }
    if (needsReauth) {
      status = "reconnect_required";
    }

    return {
      provider: row.provider,
      status,
      token_expires_at: row.token_expires_at ?? null,
      has_refresh_token: !!row.refresh_token_enc,
      external_account_id: row.external_account_id ?? null,
      updated_at: row.updated_at ?? null,
    };
  });
}
