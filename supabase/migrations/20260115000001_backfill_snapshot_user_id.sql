-- Backfill user_id in snapshots from sources.installation_id
-- This ensures snapshots have user_id populated for backwards compatibility

-- Update snapshots to set user_id from their source's installation's user_id (if any)
UPDATE snapshots s
SET user_id = i.user_id
FROM sources src
LEFT JOIN installations i ON i.id = src.installation_id
WHERE s.source_id = src.id
  AND s.user_id IS NULL
  AND i.user_id IS NOT NULL;

-- For snapshots where installation has no user_id, use a placeholder
-- (This maintains the nullable user_id but fills in where possible)
