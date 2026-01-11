-- NO-LOGIN MODE: Installation-based anonymous access
-- Remove user_id requirements and use installation_id instead

-- Create installations table
CREATE TABLE IF NOT EXISTS installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on installations (block all client access)
ALTER TABLE installations ENABLE ROW LEVEL SECURITY;

-- Drop existing oauth_connections table if it exists (to recreate with installation_id)
DROP TABLE IF EXISTS oauth_connections CASCADE;

-- Recreate oauth_connections with installation_id instead of user_id
CREATE TABLE oauth_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id UUID NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  tool TEXT NOT NULL CHECK (tool IN ('jobber', 'quickbooks', 'servicetitan', 'square')),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(installation_id, tool)
);

-- Indexes for oauth_connections
CREATE INDEX idx_oauth_connections_installation_tool ON oauth_connections(installation_id, tool);
CREATE INDEX idx_oauth_connections_expires_at ON oauth_connections(expires_at);

-- Enable RLS on oauth_connections (block all client access)
ALTER TABLE oauth_connections ENABLE ROW LEVEL SECURITY;

-- Update sources table: add installation_id, make user_id nullable
ALTER TABLE sources ADD COLUMN IF NOT EXISTS installation_id UUID REFERENCES installations(id) ON DELETE CASCADE;
ALTER TABLE sources ALTER COLUMN user_id DROP NOT NULL;

-- Create index for installation-based queries
CREATE INDEX IF NOT EXISTS idx_sources_installation_id ON sources(installation_id);

-- Update snapshots table: make user_id nullable (will use installation_id via source)
ALTER TABLE snapshots ALTER COLUMN user_id DROP NOT NULL;

-- Drop old RLS policies that rely on auth.uid()
DROP POLICY IF EXISTS sources_user_policy ON sources;
DROP POLICY IF EXISTS estimates_user_policy ON estimates_normalized;
DROP POLICY IF EXISTS buckets_user_policy ON estimate_buckets;
DROP POLICY IF EXISTS snapshots_user_policy ON snapshots;

-- No new RLS policies for anon users = server-only access via service role key
-- This blocks all client access and enforces server-side operations only

-- Update source_type constraint to include jobber and invoice
DO $$ 
BEGIN
  ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_source_type_check;
  ALTER TABLE sources ADD CONSTRAINT sources_source_type_check 
    CHECK (source_type IN ('csv', 'salesforce', 'hubspot', 'jobber', 'quickbooks', 'servicetitan', 'square', 'invoice'));
END $$;
