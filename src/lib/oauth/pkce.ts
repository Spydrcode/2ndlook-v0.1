import { createHash, randomBytes } from "node:crypto";

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function createCodeVerifier(): string {
  return base64UrlEncode(randomBytes(32));
}

export function createCodeChallenge(verifier: string): string {
  const hash = createHash("sha256").update(verifier).digest();
  return base64UrlEncode(hash);
}
