import { cookies } from "next/headers";

import { createAdminClient } from "../supabase/admin";

const INSTALLATION_COOKIE_NAME = "installation_id";
const INSTALLATION_COOKIE_MAX_AGE = 180 * 24 * 60 * 60; // 180 days in seconds

/**
 * Get or create an installation ID for anonymous user tracking.
 * This enables no-login mode where users are identified by a persistent cookie.
 *
 * @returns The installation ID (UUID string)
 */
export async function getOrCreateInstallationId(): Promise<string> {
  const cookieStore = await cookies();
  const existingId = cookieStore.get(INSTALLATION_COOKIE_NAME)?.value;

  if (existingId) {
    return existingId;
  }

  // Create a new installation
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.from("installations").insert({}).select("id").single();

  if (error || !data) {
    throw new Error(`Failed to create installation: ${error?.message || "Unknown error"}`);
  }

  const installationId = data.id;

  // Set the cookie
  cookieStore.set({
    name: INSTALLATION_COOKIE_NAME,
    value: installationId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: INSTALLATION_COOKIE_MAX_AGE,
    path: "/",
  });

  return installationId;
}

/**
 * Get the current installation ID without creating a new one.
 * Returns null if no installation exists.
 */
export async function getInstallationId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(INSTALLATION_COOKIE_NAME)?.value || null;
}
