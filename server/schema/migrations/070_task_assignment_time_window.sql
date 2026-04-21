-- Add time window support for task assignments.
-- Allows UI to choose exact start/end datetime while keeping existing date-based daily logs.
--
-- Note: Avoid `ADD COLUMN IF NOT EXISTS` here — many MySQL builds and TiDB versions do not
-- support it, so the columns never get created and later INDEX statements fail.

USE call_nest;

-- Add columns in separate statements (run each once; "Duplicate column" means already applied).
ALTER TABLE task_assignments
  ADD COLUMN start_at DATETIME NULL AFTER end_date;

ALTER TABLE task_assignments
  ADD COLUMN end_at DATETIME NULL AFTER start_at;

UPDATE task_assignments
SET start_at = COALESCE(start_at, CONCAT(start_date, ' 00:00:00')),
    end_at = COALESCE(end_at, CONCAT(end_date, ' 23:59:59'))
WHERE deleted_at IS NULL;

ALTER TABLE task_assignments
  ADD INDEX idx_task_assignments_tenant_user_start_at (tenant_id, assigned_to_user_id, start_at);

ALTER TABLE task_assignments
  ADD INDEX idx_task_assignments_tenant_user_end_at (tenant_id, assigned_to_user_id, end_at);
