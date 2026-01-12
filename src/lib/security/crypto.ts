import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY is not configured");
  }

  if (/^[0-9a-fA-F]{64}$/.test(key)) {
    return Buffer.from(key, "hex");
  }

  const base64 = Buffer.from(key, "base64");
  if (base64.length === 32) {
    return base64;
  }

  if (key.length === 32) {
    return Buffer.from(key, "utf8");
  }

  throw new Error("ENCRYPTION_KEY must be 32 bytes (base64/hex) or 32 chars");
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = ciphertext.split(":");

  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid ciphertext format");
  }

  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return plaintext.toString("utf8");
}
