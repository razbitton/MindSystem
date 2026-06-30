DO $$ BEGIN
  CREATE TYPE ai_autonomy_mode AS ENUM ('conservative', 'balanced', 'autopilot');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE ai_operation_decision AS ENUM ('auto_apply', 'auto_apply_with_audit', 'needs_review', 'reject_or_ignore');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS ai_operation_policies (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  mode ai_autonomy_mode NOT NULL DEFAULT 'balanced',
  auto_apply_min_confidence numeric(4,3) NOT NULL DEFAULT 0.82,
  review_below_confidence numeric(4,3) NOT NULL DEFAULT 0.65,
  require_review_for_destructive boolean NOT NULL DEFAULT true,
  require_review_for_sensitive boolean NOT NULL DEFAULT true,
  require_review_for_conflicts boolean NOT NULL DEFAULT true,
  require_review_for_bulk_changes boolean NOT NULL DEFAULT true,
  max_auto_apply_batch_size integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_id uuid,
  actor_type text NOT NULL,
  actor_id text,
  operation_type text NOT NULL,
  decision ai_operation_decision NOT NULL,
  reason text NOT NULL,
  raw_item_id uuid REFERENCES raw_items(id) ON DELETE SET NULL,
  entity_id uuid REFERENCES entities(id) ON DELETE SET NULL,
  affected_records jsonb NOT NULL DEFAULT '[]'::jsonb,
  previous_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(4,3),
  source_reliability numeric(4,3),
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  undo_status text NOT NULL DEFAULT 'not_available',
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO ai_operation_policies (workspace_id)
SELECT id
FROM workspaces
ON CONFLICT (workspace_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS ai_activity_log_workspace_created_idx
  ON ai_activity_log(workspace_id, created_at);

CREATE INDEX IF NOT EXISTS ai_activity_log_workspace_decision_idx
  ON ai_activity_log(workspace_id, decision);
