-- Jobber connection event log (app-level diagnostics)

CREATE TABLE IF NOT EXISTS jobber_connection_events (
  event_id UUID NOT NULL,
  installation_id UUID NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  phase TEXT NOT NULL CHECK (phase IN (
    'oauth_start',
    'oauth_callback',
    'token_exchange',
    'ingest_start',
    'ingest_error',
    'ingest_success'
  )),
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobber_connection_events_installation
  ON jobber_connection_events (installation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobber_connection_events_event_id
  ON jobber_connection_events (event_id);

ALTER TABLE jobber_connection_events ENABLE ROW LEVEL SECURITY;
