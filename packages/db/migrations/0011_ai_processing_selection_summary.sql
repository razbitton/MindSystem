alter table ai_processing_runs
  add column if not exists selection_summary jsonb not null default '{}'::jsonb;
