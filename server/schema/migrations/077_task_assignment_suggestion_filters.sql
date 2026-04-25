-- Add optional suggestion filters for to-do tasks.
-- Stores selected campaign ids and tag ids as JSON arrays.

USE call_nest;

ALTER TABLE task_assignments
  ADD COLUMN suggestion_campaign_ids JSON NULL AFTER associated_meeting_id;

ALTER TABLE task_assignments
  ADD COLUMN suggestion_tag_ids JSON NULL AFTER suggestion_campaign_ids;
