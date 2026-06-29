CREATE EXTENSION IF NOT EXISTS vector;

ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'memory';

DO $$ BEGIN
  CREATE TYPE memory_kind AS ENUM (
    'fact',
    'decision',
    'preference',
    'constraint',
    'commitment',
    'open_question',
    'project_update',
    'person_profile',
    'topic_note'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE memory_status AS ENUM ('active', 'superseded', 'archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE memory_importance AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chunks' AND column_name = 'embedding'
  ) AND (
    SELECT udt_name FROM information_schema.columns
    WHERE table_name = 'chunks' AND column_name = 'embedding'
  ) <> 'vector' THEN
    ALTER TABLE chunks ALTER COLUMN embedding TYPE vector(1536) USING NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS memory_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL UNIQUE REFERENCES entities(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  source_raw_item_id uuid REFERENCES raw_items(id) ON DELETE SET NULL,
  kind memory_kind NOT NULL,
  status memory_status NOT NULL DEFAULT 'active',
  importance memory_importance NOT NULL DEFAULT 'medium',
  title text NOT NULL,
  summary text,
  body text NOT NULL,
  confidence_score numeric(4,3) NOT NULL DEFAULT 1,
  supersedes_memory_id uuid,
  superseded_by_memory_id uuid,
  occurred_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'memory_records_supersedes_memory_fk'
  ) THEN
    ALTER TABLE memory_records
      ADD CONSTRAINT memory_records_supersedes_memory_fk
      FOREIGN KEY (supersedes_memory_id) REFERENCES memory_records(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'memory_records_superseded_by_memory_fk'
  ) THEN
    ALTER TABLE memory_records
      ADD CONSTRAINT memory_records_superseded_by_memory_fk
      FOREIGN KEY (superseded_by_memory_id) REFERENCES memory_records(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS memory_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  memory_record_id uuid NOT NULL REFERENCES memory_records(id) ON DELETE CASCADE,
  raw_item_id uuid REFERENCES raw_items(id) ON DELETE SET NULL,
  source_quote text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entity_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  alias text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, entity_id, alias)
);

CREATE INDEX IF NOT EXISTS memory_records_workspace_kind_updated_idx
  ON memory_records(workspace_id, kind, updated_at DESC);

CREATE INDEX IF NOT EXISTS memory_records_workspace_status_idx
  ON memory_records(workspace_id, status);

CREATE INDEX IF NOT EXISTS memory_records_project_idx
  ON memory_records(project_id);

CREATE INDEX IF NOT EXISTS memory_sources_memory_idx
  ON memory_sources(memory_record_id);

CREATE INDEX IF NOT EXISTS memory_sources_workspace_idx
  ON memory_sources(workspace_id);

CREATE INDEX IF NOT EXISTS entity_aliases_lookup_idx
  ON entity_aliases(workspace_id, alias);

CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx
  ON chunks USING hnsw (embedding vector_cosine_ops);
