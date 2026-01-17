-- Expand Jobber connection event phases for disconnect tracking

ALTER TABLE jobber_connection_events
  DROP CONSTRAINT IF EXISTS jobber_connection_events_phase_check;

ALTER TABLE jobber_connection_events
  ADD CONSTRAINT jobber_connection_events_phase_check
  CHECK (phase IN (
    'oauth_start',
    'oauth_callback',
    'token_exchange',
    'ingest_start',
    'ingest_error',
    'ingest_success',
    'disconnect',
    'webhook_disconnect'
  ));
