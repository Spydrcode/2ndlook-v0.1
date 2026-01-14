-- Jobber jobs and clients (signal-only)
-- Stores minimal identifiers and status fields for analytics (no PII)

-- Normalized jobs table
CREATE TABLE IF NOT EXISTS jobs_normalized (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id TEXT NOT NULL,
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  job_status TEXT NOT NULL DEFAULT 'unknown',
  job_total NUMERIC(12, 2),
  client_id TEXT,
  created_at_ingested TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_jobs_normalized_source_id ON jobs_normalized(source_id);
CREATE INDEX IF NOT EXISTS idx_jobs_normalized_client_id ON jobs_normalized(client_id);

-- Normalized clients table
CREATE TABLE IF NOT EXISTS clients_normalized (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ,
  is_lead BOOLEAN,
  created_at_ingested TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_clients_normalized_source_id ON clients_normalized(source_id);

-- Enable RLS (server-only access via service role)
ALTER TABLE jobs_normalized ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients_normalized ENABLE ROW LEVEL SECURITY;
