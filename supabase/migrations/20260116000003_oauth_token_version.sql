-- Add token_version for optimistic concurrency on token refresh

ALTER TABLE oauth_connections
  ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 0;

UPDATE oauth_connections
SET token_version = 0
WHERE token_version IS NULL;

ALTER TABLE oauth_connections
  ALTER COLUMN token_version SET NOT NULL;
