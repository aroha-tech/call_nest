-- ============================================
-- Migration 112: Per-meeting IANA timezone (wall time for start/end + calendar sync)
-- Paste-ready SQL for SQL editors:
--   USE call_nest;
--   SOURCE server/schema/migrations/112_tenant_meetings_meeting_timezone.sql;
--
-- File-based run from project root:
--   mysql -u root -p call_nest < server/schema/migrations/112_tenant_meetings_meeting_timezone.sql
--   -- or inside MySQL after USE call_nest;
--   source server/schema/migrations/112_tenant_meetings_meeting_timezone.sql
-- ============================================

ALTER TABLE tenant_meetings
  ADD COLUMN meeting_timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata'
  COMMENT 'IANA timezone for start/end civil time and provider calendar'
  AFTER end_at;
