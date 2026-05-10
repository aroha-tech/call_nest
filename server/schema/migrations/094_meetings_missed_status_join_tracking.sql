-- ============================================
-- Migration 094: Meetings — explicit missed status + join tracking
-- Paste-ready for SQL editors, then:
--   mysql -u root -p call_nest < server/schema/migrations/094_meetings_missed_status_join_tracking.sql
-- Or: source server/schema/migrations/094_meetings_missed_status_join_tracking.sql
-- ============================================

ALTER TABLE tenant_meetings
  MODIFY COLUMN meeting_status ENUM('scheduled', 'completed', 'cancelled', 'rescheduled', 'missed') NOT NULL DEFAULT 'scheduled';

ALTER TABLE tenant_meetings
  ADD COLUMN join_opened_at DATETIME NULL DEFAULT NULL AFTER attendance_status;
