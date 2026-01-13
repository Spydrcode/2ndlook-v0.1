import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt, encrypt } from "@/lib/security/crypto";
import type { OAuthProviderTool } from "@/lib/oauth/providers";

export interface OAuthConnection {
  installation_id: string;
  provider: OAuthProviderTool;
  access_token: string;
  refresh_token?: string | null;
  token_expires_at?: string | null;
  scopes?: string | null;
  external_account_id?: string | null;
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
    throw new TokenDecryptError(
      error instanceof Error ? error.message : "token_decrypt_failed"
    );
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
  metadata?: Record<string, unknown> | null;
}) {
  const supabase = createAdminClient();
  const accessTokenEnc = encrypt(params.accessToken);
  const refreshTokenEnc = params.refreshToken ? encrypt(params.refreshToken) : null;

  const { error } = await supabase.from("oauth_connections").upsert(
    {
      installation_id: params.installationId,
      provider: params.provider,
      access_token_enc: accessTokenEnc,
      refresh_token_enc: refreshTokenEnc,
      token_expires_at: params.tokenExpiresAt ?? null,
      scopes: params.scopes ?? null,
      external_account_id: params.externalAccountId ?? null,
      metadata: params.metadata ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "installation_id,provider" }
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function getConnection(
  installationId: string,
  provider: OAuthProviderTool | "jobber"
): Promise<OAuthConnection | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("oauth_connections")
    .select(
      "installation_id, provider, access_token_enc, refresh_token_enc, token_expires_at, scopes, external_account_id, metadata"
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
    metadata: (data.metadata as Record<string, unknown>) ?? null,
  };
}

export async function requireConnection(
  installationId: string,
  provider: OAuthProviderTool | "jobber"
): Promise<OAuthConnection> {
  const connection = await getConnection(installationId, provider);
  if (!connection) {
    throw new Error("oauth_connection_missing");
  }
  return connection;
}

export async function disconnectConnection(
  installationId: string,
  provider: OAuthProviderTool | "jobber"
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

export async function refreshIfNeeded(): Promise<never> {
  throw new Error("oauth_refresh_not_implemented");
}

export async function listConnectionStatuses(
  installationId: string
): Promise<
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
      "provider, access_token_enc, refresh_token_enc, token_expires_at, external_account_id, updated_at"
    )
    .eq("installation_id", installationId);

  if (error || !data) {
    return [];
  }

  return data.map((row) => {
    let status: "connected" | "reconnect_required" = "connected";

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
