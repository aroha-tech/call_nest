-- Enforce: only one active daily task per agent per day (tenant-scoped).
--
-- IMPORTANT: Some MySQL-compatible engines (e.g. certain TiDB builds) do not support
-- adding STORED generated columns via ALTER TABLE. So we use a normal flag column
-- that is flipped to 0 on soft-delete.

USE call_nest;

ALTER TABLE daily_task_logs
  ADD COLUMN active_row TINYINT(1) NOT NULL DEFAULT 1 AFTER deleted_at;

-- Backfill: ensure already soft-deleted rows don't block new inserts.
UPDATE daily_task_logs
SET active_row = IF(deleted_at IS NULL, 1, 0);

-- Only one active (non-deleted) row per (tenant, user, date).
ALTER TABLE daily_task_logs
  ADD UNIQUE KEY uq_daily_task_logs_one_per_user_day (tenant_id, user_id, task_date, active_row);

-- Speed up conflict lookup queries used by the API.
ALTER TABLE daily_task_logs
  ADD INDEX idx_daily_task_logs_tenant_user_date_deleted (tenant_id, user_id, task_date, deleted_at);

