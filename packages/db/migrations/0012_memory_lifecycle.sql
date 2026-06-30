DO $$ BEGIN
  CREATE TYPE memory_validity AS ENUM ('current', 'stale', 'disputed', 'superseded');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE memory_records
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS stale_after timestamptz,
  ADD COLUMN IF NOT EXISTS validity memory_validity NOT NULL DEFAULT 'current',
  ADD COLUMN IF NOT EXISTS confidence_reason text,
  ADD COLUMN IF NOT EXISTS source_reliability numeric(4,3) NOT NULL DEFAULT 0.8;

UPDATE memory_records
SET validity = 'superseded'
WHERE status = 'superseded'
  AND validity <> 'superseded';

CREATE INDEX IF NOT EXISTS memory_records_workspace_validity_idx
  ON memory_records(workspace_id, validity);

CREATE INDEX IF NOT EXISTS memory_records_workspace_stale_after_idx
  ON memory_records(workspace_id, stale_after);
