DO $$ BEGIN
  CREATE TYPE task_kind AS ENUM ('one_off', 'ongoing');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS kind task_kind NOT NULL DEFAULT 'one_off';

UPDATE tasks
SET
  due_at = NULL,
  scheduled_for = NULL,
  estimate_minutes = NULL,
  completed_at = NULL,
  status = CASE WHEN status = 'done' THEN 'todo'::task_status ELSE status END
WHERE kind = 'ongoing';
