DO $$ BEGIN
  CREATE TYPE daily_objective_state AS ENUM ('pinned', 'dismissed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS daily_objective_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  local_date date NOT NULL,
  state daily_objective_state NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, task_id, local_date)
);

CREATE INDEX IF NOT EXISTS daily_objective_overrides_workspace_date_idx
  ON daily_objective_overrides (workspace_id, local_date);

CREATE INDEX IF NOT EXISTS daily_objective_overrides_task_idx
  ON daily_objective_overrides (task_id);
