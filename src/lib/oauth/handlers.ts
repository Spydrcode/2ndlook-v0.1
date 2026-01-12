import "server-only";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getOrCreateInstallationId } from "@/lib/installations/cookie";
import { createOAuthState, serializeOAuthState, verifyOAuthState } from "@/lib/oauth/state";
import { createCodeChallenge, createCodeVerifier } from "@/lib/oauth/pkce";
import { getOAuthProviderConfig, type OAuthProviderTool } from "@/lib/oauth/providers";
import { upsertConnection } from "@/lib/oauth/connections";

const DEFAULT_REDIRECT_PATH = "/dashboard/connect";

function getAppUrl(request: NextRequest): string {
  return process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
}

function normalizeOAuthError(code?: string): string {
  if (!code) {
    return "oauth_exchange_failed";
  }
  if (code === "access_denied" || code === "user_denied") {
    return "oauth_denied";
  }
  if (code === "invalid_scope") {
    return "oauth_scope_insufficient";
  }
  return "oauth_exchange_failed";
}

export async function handleOAuthStart(
  request: NextRequest,
  provider: OAuthProviderTool
): Promise<NextResponse> {
  const appUrl = getAppUrl(request);

  try {
    const installationId = await getOrCreateInstallationId();
    const requestedRedirect =
      request.nextUrl.searchParams.get("redirect_to") ?? DEFAULT_REDIRECT_PATH;
    const redirectTo = requestedRedirect.startsWith("/")
      ? requestedRedirect
      : DEFAULT_REDIRECT_PATH;

    const config = getOAuthProviderConfig(provider);
    const codeVerifier = config.usesPkce ? createCodeVerifier() : undefined;
    const codeChallenge = codeVerifier ? createCodeChallenge(codeVerifier) : undefined;

    const statePayload = createOAuthState({
      installationId,
      provider,
      redirectTo,
      pkceVerifier: codeVerifier,
    });
    const state = serializeOAuthState(statePayload);
    const redirectUri = getEnvRedirectUri(provider);
    const url = config.buildAuthorizeUrl({
      state,
      redirectUri,
      codeChallenge,
    });

    return NextResponse.redirect(url);
  } catch (error) {
    return NextResponse.redirect(
      new URL(
        `${DEFAULT_REDIRECT_PATH}?error=oauth_provider_misconfigured&provider=${provider}`,
        appUrl
      )
    );
  }
}

export async function handleOAuthCallback(
  request: NextRequest,
  provider: OAuthProviderTool
): Promise<NextResponse> {
  const appUrl = getAppUrl(request);
  const searchParams = request.nextUrl.searchParams;
  const redirectBase = new URL(DEFAULT_REDIRECT_PATH, appUrl);

  const error = searchParams.get("error");
  if (error) {
    redirectBase.searchParams.set("error", normalizeOAuthError(error));
    redirectBase.searchParams.set("provider", provider);
    return NextResponse.redirect(redirectBase.toString());
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    redirectBase.searchParams.set("error", "oauth_exchange_failed");
    redirectBase.searchParams.set("provider", provider);
    return NextResponse.redirect(redirectBase.toString());
  }

  let verified;
  try {
    verified = verifyOAuthState(state);
  } catch {
    redirectBase.searchParams.set("error", "oauth_state_invalid");
    redirectBase.searchParams.set("provider", provider);
    return NextResponse.redirect(redirectBase.toString());
  }

  if (verified.provider !== provider) {
    redirectBase.searchParams.set("error", "oauth_state_invalid");
    redirectBase.searchParams.set("provider", provider);
    return NextResponse.redirect(redirectBase.toString());
  }

  try {
    const config = getOAuthProviderConfig(provider);
    const redirectUri = getEnvRedirectUri(provider);
    if (config.usesPkce && !verified.pkce_verifier) {
      throw new Error("oauth_state_invalid");
    }

    const tokenResponse = await config.exchangeCode({
      code,
      redirectUri,
      codeVerifier: verified.pkce_verifier,
    });

    if (!tokenResponse.access_token) {
      throw new Error("oauth_exchange_failed");
    }

    const expiresAt = tokenResponse.expires_in
      ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
      : null;

    await upsertConnection({
      installationId: verified.installation_id,
      provider,
      accessToken: tokenResponse.access_token,
      refreshToken:
        typeof tokenResponse.refresh_token === "string"
          ? tokenResponse.refresh_token
          : null,
      tokenExpiresAt: expiresAt,
      scopes:
        typeof tokenResponse.scope === "string"
          ? tokenResponse.scope
          : config.scopes.join(" "),
      externalAccountId: config.parseExternalAccountId(
        tokenResponse,
        searchParams
      ),
      metadata: {
        granted_at: new Date().toISOString(),
        environment: getProviderEnvironment(provider),
      },
    });

    const redirectTo = new URL(verified.redirect_to, appUrl);
    redirectTo.searchParams.set("connected", provider);
    return NextResponse.redirect(redirectTo.toString());
  } catch (error) {
    redirectBase.searchParams.set(
      "error",
      normalizeExchangeError(error instanceof Error ? error.message : "")
    );
    redirectBase.searchParams.set("provider", provider);
    return NextResponse.redirect(redirectBase.toString());
  }
}

function getEnvRedirectUri(provider: OAuthProviderTool): string {
  switch (provider) {
    case "stripe":
      return getEnv("STRIPE_CONNECT_REDIRECT_URI");
    case "square":
      return getEnv("SQUARE_REDIRECT_URI");
    case "quickbooks":
      return getEnv("QBO_REDIRECT_URI");
    case "zoho-invoice":
      return getEnv("ZOHO_REDIRECT_URI");
    case "wave":
      return getEnv("WAVE_REDIRECT_URI");
    case "housecall-pro":
      return getEnv("HOUSECALLPRO_REDIRECT_URI");
  }
}

function getEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing ${key}`);
  }
  return value;
}

function getProviderEnvironment(provider: OAuthProviderTool): string | null {
  switch (provider) {
    case "square":
      return process.env.SQUARE_ENV ?? null;
    case "quickbooks":
      return process.env.QBO_ENV ?? null;
    default:
      return null;
  }
}

function normalizeExchangeError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("insufficient_scope")) {
    return "oauth_scope_insufficient";
  }
  if (lower.includes("oauth_state_invalid")) {
    return "oauth_state_invalid";
  }
  if (lower.includes("missing ")) {
    return "oauth_provider_misconfigured";
  }
  if (lower.includes("oauth_provider_misconfigured")) {
    return "oauth_provider_misconfigured";
  }
  return "oauth_exchange_failed";
}
