import "server-only";

import { exchangeOAuthToken, type OAuthTokenResponse } from "@/lib/oauth/client";

export type OAuthProviderTool = "stripe" | "square" | "quickbooks" | "zoho-invoice" | "wave" | "housecall-pro";

export interface OAuthProviderConfig {
  tool: OAuthProviderTool;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  usesPkce: boolean;
  extraAuthorizeParams?: Record<string, string>;
  buildAuthorizeUrl: (params: { state: string; redirectUri: string; codeChallenge?: string }) => string;
  exchangeCode: (params: { code: string; redirectUri: string; codeVerifier?: string }) => Promise<OAuthTokenResponse>;
  parseExternalAccountId: (tokenResponse: OAuthTokenResponse, callbackQuery: URLSearchParams) => string | null;
}

function getEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing ${key}`);
  }
  return value;
}

function buildAuthorizeUrl(baseUrl: string, params: Record<string, string | undefined>): string {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

// Stripe Connect OAuth: https://connect.stripe.com/oauth/authorize
const stripeProvider: OAuthProviderConfig = {
  tool: "stripe",
  authorizeUrl: "https://connect.stripe.com/oauth/authorize",
  tokenUrl: "https://connect.stripe.com/oauth/token",
  scopes: ["read_only"],
  usesPkce: false,
  buildAuthorizeUrl: ({ state, redirectUri }) =>
    buildAuthorizeUrl("https://connect.stripe.com/oauth/authorize", {
      response_type: "code",
      client_id: getEnv("STRIPE_CONNECT_CLIENT_ID"),
      redirect_uri: redirectUri,
      scope: "read_only",
      state,
    }),
  exchangeCode: async ({ code, redirectUri }) =>
    exchangeOAuthToken({
      tokenUrl: "https://connect.stripe.com/oauth/token",
      body: {
        grant_type: "authorization_code",
        code,
        client_id: getEnv("STRIPE_CONNECT_CLIENT_ID"),
        client_secret: getEnv("STRIPE_CONNECT_CLIENT_SECRET"),
        redirect_uri: redirectUri,
      },
    }),
  parseExternalAccountId: (tokenResponse) =>
    typeof tokenResponse.stripe_user_id === "string" ? tokenResponse.stripe_user_id : null,
};

// Square OAuth + PKCE: https://connect.squareup.com/oauth2/authorize
const squareProvider: OAuthProviderConfig = {
  tool: "square",
  authorizeUrl: "https://connect.squareup.com/oauth2/authorize",
  tokenUrl: "https://connect.squareup.com/oauth2/token",
  scopes: ["INVOICES_READ"],
  usesPkce: true,
  buildAuthorizeUrl: ({ state, redirectUri, codeChallenge }) =>
    buildAuthorizeUrl("https://connect.squareup.com/oauth2/authorize", {
      client_id: getEnv("SQUARE_APP_ID"),
      response_type: "code",
      redirect_uri: redirectUri,
      scope: "INVOICES_READ",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    }),
  exchangeCode: async ({ code, redirectUri, codeVerifier }) =>
    exchangeOAuthToken({
      tokenUrl: "https://connect.squareup.com/oauth2/token",
      body: {
        client_id: getEnv("SQUARE_APP_ID"),
        client_secret: getEnv("SQUARE_APP_SECRET"),
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier ?? "",
      },
    }),
  parseExternalAccountId: (tokenResponse) =>
    typeof tokenResponse.merchant_id === "string" ? tokenResponse.merchant_id : null,
};

// QuickBooks (Intuit) OAuth2: https://appcenter.intuit.com/connect/oauth2
const quickbooksProvider: OAuthProviderConfig = {
  tool: "quickbooks",
  authorizeUrl: "https://appcenter.intuit.com/connect/oauth2",
  tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
  scopes: ["com.intuit.quickbooks.accounting"],
  usesPkce: false,
  buildAuthorizeUrl: ({ state, redirectUri }) =>
    buildAuthorizeUrl("https://appcenter.intuit.com/connect/oauth2", {
      client_id: getEnv("QBO_CLIENT_ID"),
      response_type: "code",
      scope: "com.intuit.quickbooks.accounting",
      redirect_uri: redirectUri,
      state,
    }),
  exchangeCode: async ({ code, redirectUri }) =>
    exchangeOAuthToken({
      tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      headers: {
        Authorization: `Basic ${Buffer.from(`${getEnv("QBO_CLIENT_ID")}:${getEnv("QBO_CLIENT_SECRET")}`).toString(
          "base64",
        )}`,
      },
      body: {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      },
    }),
  parseExternalAccountId: (_tokenResponse, callbackQuery) => callbackQuery.get("realmId"),
};

// Zoho Accounts OAuth2: https://accounts.zoho.com/oauth/v2/token
const zohoProvider: OAuthProviderConfig = {
  tool: "zoho-invoice",
  authorizeUrl: "https://accounts.zoho.com/oauth/v2/auth",
  tokenUrl: "https://accounts.zoho.com/oauth/v2/token",
  scopes: ["ZohoInvoice.invoices.READ"],
  usesPkce: false,
  buildAuthorizeUrl: ({ state, redirectUri }) => {
    const dc = process.env.ZOHO_DC || "accounts.zoho.com";
    return buildAuthorizeUrl(`https://${dc}/oauth/v2/auth`, {
      client_id: getEnv("ZOHO_CLIENT_ID"),
      response_type: "code",
      scope: "ZohoInvoice.invoices.READ",
      redirect_uri: redirectUri,
      access_type: "offline",
      prompt: "consent",
      state,
    });
  },
  exchangeCode: async ({ code, redirectUri }) => {
    const dc = process.env.ZOHO_DC || "accounts.zoho.com";
    return exchangeOAuthToken({
      tokenUrl: `https://${dc}/oauth/v2/token`,
      body: {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: getEnv("ZOHO_CLIENT_ID"),
        client_secret: getEnv("ZOHO_CLIENT_SECRET"),
      },
    });
  },
  parseExternalAccountId: (tokenResponse) =>
    typeof tokenResponse.organization_id === "string" ? tokenResponse.organization_id : null,
};

// Wave OAuth2: https://api.waveapps.com/oauth2/authorize
const waveProvider: OAuthProviderConfig = {
  tool: "wave",
  authorizeUrl: "https://api.waveapps.com/oauth2/authorize",
  tokenUrl: "https://api.waveapps.com/oauth2/token",
  scopes: ["invoicing:read"],
  usesPkce: false,
  buildAuthorizeUrl: ({ state, redirectUri }) =>
    buildAuthorizeUrl("https://api.waveapps.com/oauth2/authorize", {
      client_id: getEnv("WAVE_CLIENT_ID"),
      response_type: "code",
      scope: "invoicing:read",
      redirect_uri: redirectUri,
      state,
    }),
  exchangeCode: async ({ code, redirectUri }) =>
    exchangeOAuthToken({
      tokenUrl: "https://api.waveapps.com/oauth2/token",
      body: {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: getEnv("WAVE_CLIENT_ID"),
        client_secret: getEnv("WAVE_CLIENT_SECRET"),
      },
    }),
  parseExternalAccountId: () => null,
};

// Housecall Pro OAuth2: https://api.housecallpro.com/oauth/authorize
const housecallProvider: OAuthProviderConfig = {
  tool: "housecall-pro",
  authorizeUrl: "https://api.housecallpro.com/oauth/authorize",
  tokenUrl: "https://api.housecallpro.com/oauth/token",
  scopes: ["read"],
  usesPkce: false,
  buildAuthorizeUrl: ({ state, redirectUri }) =>
    buildAuthorizeUrl("https://api.housecallpro.com/oauth/authorize", {
      client_id: getEnv("HOUSECALLPRO_CLIENT_ID"),
      response_type: "code",
      scope: "read",
      redirect_uri: redirectUri,
      state,
    }),
  exchangeCode: async ({ code, redirectUri }) =>
    exchangeOAuthToken({
      tokenUrl: "https://api.housecallpro.com/oauth/token",
      body: {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: getEnv("HOUSECALLPRO_CLIENT_ID"),
        client_secret: getEnv("HOUSECALLPRO_CLIENT_SECRET"),
      },
    }),
  parseExternalAccountId: () => null,
};

export function getOAuthProviderConfig(tool: OAuthProviderTool): OAuthProviderConfig {
  const providers: Record<OAuthProviderTool, OAuthProviderConfig> = {
    stripe: stripeProvider,
    square: squareProvider,
    quickbooks: quickbooksProvider,
    "zoho-invoice": zohoProvider,
    wave: waveProvider,
    "housecall-pro": housecallProvider,
  };

  return providers[tool];
}
