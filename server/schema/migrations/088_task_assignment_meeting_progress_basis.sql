-- Meeting task progress: count by scheduled meeting day vs. day the meeting was booked (created).
-- Apply from project root, e.g.:
--   mysql -u root -p call_nest < server/schema/migrations/088_task_assignment_meeting_progress_basis.sql
-- Or in MySQL after USE call_nest;:
--   source server/schema/migrations/088_task_assignment_meeting_progress_basis.sql

USE call_nest;

ALTER TABLE task_assignments
  ADD COLUMN meeting_progress_basis ENUM('scheduled_date', 'created_date') NOT NULL DEFAULT 'scheduled_date'
  AFTER task_type;
