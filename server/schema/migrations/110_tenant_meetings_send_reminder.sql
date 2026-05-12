-- Per-meeting flag: when 0, attendee reminder emails are not sent for this meeting
-- (user-level reminder templates/offsets still apply only when this is 1).
--
-- Paste-ready (adjust database name):
-- USE call_nest;
-- ALTER TABLE tenant_meetings
--   ADD COLUMN send_reminder TINYINT(1) NOT NULL DEFAULT 1
--   COMMENT 'Send attendee reminder for this meeting when owner reminder settings are enabled'
--   AFTER attendance_status;
--
-- From project root (adjust user/password/database):
-- mysql -u root -p call_nest < server/schema/migrations/110_tenant_meetings_send_reminder.sql
-- Or in mysql client after USE call_nest:
-- source server/schema/migrations/110_tenant_meetings_send_reminder.sql

ALTER TABLE tenant_meetings
  ADD COLUMN send_reminder TINYINT(1) NOT NULL DEFAULT 1
  COMMENT 'Send attendee reminder for this meeting when owner reminder settings are enabled'
  AFTER attendance_status;
