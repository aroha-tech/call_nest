-- Allow multiple task assignments per agent on the same calendar day.
-- Drops the unique index added in 071_task_manager_unique_task_per_day.sql.
-- The `active_row` column remains for soft-delete bookkeeping.

USE call_nest;

ALTER TABLE daily_task_logs
  DROP INDEX uq_daily_task_logs_one_per_user_day;
