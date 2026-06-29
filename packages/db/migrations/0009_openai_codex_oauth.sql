create table if not exists openai_codex_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  account_id text not null,
  email text,
  chatgpt_plan_type text,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text not null,
  expiry_date timestamptz,
  scope text[] not null default ARRAY[]::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists openai_codex_connections_workspace_idx
  on openai_codex_connections(workspace_id);

create index if not exists openai_codex_connections_account_idx
  on openai_codex_connections(account_id);
