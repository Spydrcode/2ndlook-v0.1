-- Snapshot lifecycle fields for async generation

ALTER TABLE snapshots
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'created';

ALTER TABLE snapshots
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

ALTER TABLE snapshots
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE snapshots
  ADD COLUMN IF NOT EXISTS input_summary JSONB;

ALTER TABLE snapshots
  ADD COLUMN IF NOT EXISTS error JSONB;

ALTER TABLE snapshots
  ALTER COLUMN result DROP NOT NULL;

ALTER TABLE snapshots
  DROP CONSTRAINT IF EXISTS snapshots_estimate_count_check;

ALTER TABLE snapshots
  ADD CONSTRAINT snapshots_estimate_count_check
  CHECK (estimate_count >= 0);

ALTER TABLE snapshots
  DROP CONSTRAINT IF EXISTS snapshots_status_check;

ALTER TABLE snapshots
  ADD CONSTRAINT snapshots_status_check
  CHECK (status IN ('created', 'queued', 'running', 'complete', 'failed'));
