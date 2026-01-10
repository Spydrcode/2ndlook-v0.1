-- 2ndlook v0.1 Database Schema
-- STRICT: Only allowed fields per Field Diet

-- Sources table
CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('csv', 'salesforce', 'hubspot')),
  source_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ingested', 'bucketed', 'snapshot_generated'))
);

CREATE INDEX idx_sources_user_id ON sources(user_id);

-- Normalized estimates table (FIELD DIET ENFORCED)
CREATE TABLE estimates_normalized (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id TEXT NOT NULL,
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL CHECK (status IN ('closed', 'accepted')),
  job_type TEXT,
  UNIQUE(source_id, estimate_id)
);

CREATE INDEX idx_estimates_source_id ON estimates_normalized(source_id);
CREATE INDEX idx_estimates_closed_at ON estimates_normalized(closed_at);

-- Estimate buckets (aggregated storage)
CREATE TABLE estimate_buckets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  
  -- Price bands
  price_band_lt_500 INT NOT NULL DEFAULT 0,
  price_band_500_1500 INT NOT NULL DEFAULT 0,
  price_band_1500_5000 INT NOT NULL DEFAULT 0,
  price_band_5000_plus INT NOT NULL DEFAULT 0,
  
  -- Decision latency bands (days)
  latency_band_0_2 INT NOT NULL DEFAULT 0,
  latency_band_3_7 INT NOT NULL DEFAULT 0,
  latency_band_8_21 INT NOT NULL DEFAULT 0,
  latency_band_22_plus INT NOT NULL DEFAULT 0,
  
  -- Weekly volume (JSONB array)
  weekly_volume JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_id)
);

CREATE INDEX idx_buckets_source_id ON estimate_buckets(source_id);

-- Snapshots table (final output storage)
CREATE TABLE snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  estimate_count INT NOT NULL CHECK (estimate_count >= 25),
  confidence_level TEXT NOT NULL CHECK (confidence_level IN ('low', 'medium', 'high')),
  
  -- Snapshot result (stored as JSONB)
  result JSONB NOT NULL,
  
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_snapshots_source_id ON snapshots(source_id);
CREATE INDEX idx_snapshots_user_id ON snapshots(user_id);
CREATE INDEX idx_snapshots_generated_at ON snapshots(generated_at DESC);

-- Row Level Security (RLS)
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimates_normalized ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policies (users can only access their own data)
CREATE POLICY sources_user_policy ON sources
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY estimates_user_policy ON estimates_normalized
  FOR ALL USING (source_id IN (SELECT id FROM sources WHERE user_id = auth.uid()));

CREATE POLICY buckets_user_policy ON estimate_buckets
  FOR ALL USING (source_id IN (SELECT id FROM sources WHERE user_id = auth.uid()));

CREATE POLICY snapshots_user_policy ON snapshots
  FOR ALL USING (user_id = auth.uid());
