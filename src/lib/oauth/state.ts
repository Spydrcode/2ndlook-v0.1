import "server-only";

import { decrypt, encrypt } from "@/lib/security/crypto";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const STATE_TTL_MS = 10 * 60 * 1000;

export interface OAuthStatePayload {
  installation_id: string;
  provider: string;
  redirect_to: string;
  created_at: number;
  nonce: string;
  pkce_verifier?: string;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(padLength), "base64").toString("utf8");
}

function getStateSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET;
  if (!secret) {
    throw new Error("OAUTH_STATE_SECRET is not configured");
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getStateSecret()).update(payload).digest("base64url");
}

export function createOAuthState(input: {
  installationId: string;
  provider: string;
  redirectTo: string;
  pkceVerifier?: string;
}): OAuthStatePayload {
  return {
    installation_id: input.installationId,
    provider: input.provider,
    redirect_to: input.redirectTo,
    created_at: Date.now(),
    nonce: randomBytes(16).toString("hex"),
    pkce_verifier: input.pkceVerifier,
  };
}

export function serializeOAuthState(payload: OAuthStatePayload): string {
  const payloadToStore = {
    ...payload,
    pkce_verifier: payload.pkce_verifier ? encrypt(payload.pkce_verifier) : undefined,
  };
  const json = JSON.stringify(payloadToStore);
  const encoded = base64UrlEncode(json);
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

export function verifyOAuthState(state: string): OAuthStatePayload {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) {
    throw new Error("oauth_state_invalid");
  }

  const expected = sign(encoded);
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    throw new Error("oauth_state_invalid");
  }

  const json = base64UrlDecode(encoded);
  const parsed = JSON.parse(json) as OAuthStatePayload;

  if (Date.now() - parsed.created_at > STATE_TTL_MS) {
    throw new Error("oauth_state_invalid");
  }

  if (parsed.pkce_verifier) {
    parsed.pkce_verifier = decrypt(parsed.pkce_verifier);
  }

  return parsed;
}
