-- Add metadata and insufficient_data status for sources

ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_status_check;
  ALTER TABLE sources ADD CONSTRAINT sources_status_check
    CHECK (status IN ('pending', 'ingested', 'bucketed', 'snapshot_generated', 'insufficient_data'));
END $$;
