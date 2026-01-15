import { encrypt } from "@/lib/security/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

type LegacyRow = {
  id: string;
  access_token_legacy?: string | null;
  refresh_token_legacy?: string | null;
  expires_at_legacy?: string | null;
};

async function run() {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("oauth_connections")
    .select("id, access_token_legacy, refresh_token_legacy, expires_at_legacy");

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.length === 0) {
    console.log("No OAuth connections found to backfill.");
    return;
  }

  const updates = data
    .filter((row: LegacyRow) => row.access_token_legacy)
    .map((row: LegacyRow) => ({
      id: row.id,
      access_token_enc: encrypt(row.access_token_legacy as string),
      refresh_token_enc: row.refresh_token_legacy ? encrypt(row.refresh_token_legacy) : null,
      token_expires_at: row.expires_at_legacy ?? null,
      updated_at: new Date().toISOString(),
    }));

  if (updates.length === 0) {
    console.log("No legacy tokens to backfill.");
    return;
  }

  const { error: updateError } = await supabase.from("oauth_connections").upsert(updates, { onConflict: "id" });

  if (updateError) {
    throw new Error(updateError.message);
  }

  console.log(`Backfilled ${updates.length} OAuth connection(s).`);
}

run().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
