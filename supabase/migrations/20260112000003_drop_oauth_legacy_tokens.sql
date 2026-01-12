-- Drop legacy plaintext columns after backfill is complete
ALTER TABLE oauth_connections DROP COLUMN IF EXISTS access_token_legacy;
ALTER TABLE oauth_connections DROP COLUMN IF EXISTS refresh_token_legacy;
ALTER TABLE oauth_connections DROP COLUMN IF EXISTS expires_at_legacy;
