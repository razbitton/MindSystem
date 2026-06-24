CREATE TABLE IF NOT EXISTS google_calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  google_account_email text,
  access_token_ciphertext text,
  refresh_token_ciphertext text NOT NULL,
  token_type text,
  scope text[] NOT NULL DEFAULT ARRAY[]::text[],
  expiry_date timestamptz,
  selected_calendar_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS google_calendar_connections_workspace_user_idx
  ON google_calendar_connections(workspace_id, user_id);
