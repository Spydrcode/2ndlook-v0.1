-- OAuth connections v2 (encrypted tokens, installation-based, provider slugs)

DO $$
BEGIN
  -- Rename tool column to provider if needed
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'oauth_connections'
      AND column_name = 'tool'
  ) THEN
    ALTER TABLE oauth_connections RENAME COLUMN tool TO provider;
  END IF;
END $$;

-- Drop old constraint and index if present
ALTER TABLE oauth_connections DROP CONSTRAINT IF EXISTS oauth_connections_tool_check;
ALTER TABLE oauth_connections DROP CONSTRAINT IF EXISTS oauth_connections_installation_id_tool_key;

-- Update provider constraint
ALTER TABLE oauth_connections
  ADD CONSTRAINT oauth_connections_provider_check
  CHECK (provider IN (
    'jobber',
    'stripe',
    'square',
    'quickbooks',
    'zoho-invoice',
    'wave',
    'housecall-pro'
  ));

-- Preserve legacy plaintext token columns for one-time backfill
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'oauth_connections'
      AND column_name = 'access_token'
  ) THEN
    ALTER TABLE oauth_connections RENAME COLUMN access_token TO access_token_legacy;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'oauth_connections'
      AND column_name = 'refresh_token'
  ) THEN
    ALTER TABLE oauth_connections RENAME COLUMN refresh_token TO refresh_token_legacy;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'oauth_connections'
      AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE oauth_connections RENAME COLUMN expires_at TO expires_at_legacy;
  END IF;
END $$;

-- Add encrypted token fields and metadata
ALTER TABLE oauth_connections
  ADD COLUMN IF NOT EXISTS access_token_enc TEXT,
  ADD COLUMN IF NOT EXISTS refresh_token_enc TEXT,
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scopes TEXT,
  ADD COLUMN IF NOT EXISTS external_account_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Ensure uniqueness on installation + provider
ALTER TABLE oauth_connections
  ADD CONSTRAINT oauth_connections_installation_provider_key
  UNIQUE (installation_id, provider);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_oauth_connections_installation_provider
  ON oauth_connections (installation_id, provider);
CREATE INDEX IF NOT EXISTS idx_oauth_connections_token_expires_at
  ON oauth_connections (token_expires_at);
