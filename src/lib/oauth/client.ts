import "server-only";

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  [key: string]: unknown;
}

export async function exchangeOAuthToken(params: {
  tokenUrl: string;
  body: Record<string, string>;
  headers?: Record<string, string>;
}): Promise<OAuthTokenResponse> {
  const response = await fetch(params.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(params.headers ?? {}),
    },
    body: new URLSearchParams(params.body).toString(),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`oauth_exchange_failed:${response.status}:${text}`);
  }

  return JSON.parse(text) as OAuthTokenResponse;
}
