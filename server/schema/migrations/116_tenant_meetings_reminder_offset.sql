-- Per-meeting reminder lead time (amount + unit). NULL = use owner default mail settings at send time.
--
-- USE call_nest;
-- mysql -u root -p call_nest < server/schema/migrations/116_tenant_meetings_reminder_offset.sql
--
-- TiDB/MySQL: run as two ALTERs (cannot reference a new column in AFTER within the same statement).

ALTER TABLE tenant_meetings
  ADD COLUMN reminder_offset_value INT UNSIGNED NULL
    COMMENT 'Send reminder this many units before start when send_reminder=1'
    AFTER send_reminder;

ALTER TABLE tenant_meetings
  ADD COLUMN reminder_offset_unit VARCHAR(16) NULL
    COMMENT 'minutes | hours | days'
    AFTER reminder_offset_value;
