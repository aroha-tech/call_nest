-- Add suggested email account filters for task assignments.

USE call_nest;

ALTER TABLE task_assignments
  ADD COLUMN suggestion_email_account_ids JSON NULL AFTER suggestion_tag_ids;
