CREATE INDEX IF NOT EXISTS notes_workspace_updated_idx
  ON notes (workspace_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS tasks_workspace_updated_idx
  ON tasks (workspace_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS tasks_workspace_scheduled_idx
  ON tasks (workspace_id, scheduled_for);

CREATE INDEX IF NOT EXISTS projects_workspace_status_updated_idx
  ON projects (workspace_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS documents_workspace_updated_idx
  ON documents (workspace_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS reminders_workspace_updated_idx
  ON reminders (workspace_id, updated_at DESC);
