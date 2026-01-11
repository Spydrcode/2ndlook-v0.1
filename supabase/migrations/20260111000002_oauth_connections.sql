-- OAuth connections table for third-party integrations
-- Stores OAuth tokens for tools like Jobber, QuickBooks, etc.

CREATE TABLE IF NOT EXISTS oauth_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool TEXT NOT NULL CHECK (tool IN ('jobber', 'quickbooks', 'servicetitan', 'square')),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, tool)
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_oauth_connections_user_tool ON oauth_connections(user_id, tool);
CREATE INDEX IF NOT EXISTS idx_oauth_connections_expires_at ON oauth_connections(expires_at);

-- Enable Row Level Security
ALTER TABLE oauth_connections ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own OAuth connections"
  ON oauth_connections
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own OAuth connections"
  ON oauth_connections
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own OAuth connections"
  ON oauth_connections
  FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own OAuth connections"
  ON oauth_connections
  FOR DELETE
  USING (user_id = auth.uid());

-- Update source_type constraint to include 'jobber'
-- First, find and drop the existing constraint
DO $$ 
BEGIN
  -- Drop existing constraint if it exists
  ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_source_type_check;
  
  -- Add new constraint with 'jobber' included
  ALTER TABLE sources ADD CONSTRAINT sources_source_type_check 
    CHECK (source_type IN ('csv', 'salesforce', 'hubspot', 'jobber'));
END $$;

COMMENT ON TABLE oauth_connections IS 'Stores OAuth tokens for third-party tool integrations';
COMMENT ON COLUMN oauth_connections.tool IS 'Name of the tool (jobber, quickbooks, etc.)';
COMMENT ON COLUMN oauth_connections.expires_at IS 'When the access token expires';
COMMENT ON COLUMN oauth_connections.updated_at IS 'Last time tokens were refreshed';
