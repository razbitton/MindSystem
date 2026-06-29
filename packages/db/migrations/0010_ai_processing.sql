create table if not exists ai_processing_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  run_type text not null default 'memory_backfill',
  status text not null default 'queued',
  requested_by_user_id uuid references users(id) on delete set null,
  source_types text[] not null default ARRAY[]::text[],
  raw_item_ids uuid[] not null default ARRAY[]::uuid[],
  only_unprocessed boolean not null default true,
  dry_run boolean not null default false,
  limit_count integer not null default 500,
  batch_size integer not null default 25,
  since timestamptz,
  until timestamptz,
  total_count integer not null default 0,
  processed_count integer not null default 0,
  skipped_count integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  review_count integer not null default 0,
  failed_count integer not null default 0,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_processing_runs_workspace_status_idx
  on ai_processing_runs(workspace_id, status, created_at desc);

create table if not exists ai_processing_schedules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  enabled boolean not null default false,
  interval_minutes integer not null default 1440,
  source_types text[] not null default ARRAY[]::text[],
  only_unprocessed boolean not null default true,
  dry_run boolean not null default false,
  limit_count integer not null default 100,
  batch_size integer not null default 25,
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ai_processing_schedules_workspace_idx
  on ai_processing_schedules(workspace_id);

create index if not exists ai_processing_schedules_due_idx
  on ai_processing_schedules(enabled, next_run_at);
