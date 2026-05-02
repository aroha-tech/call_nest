-- ============================================
-- Migration 086: Scheduled callbacks — follow-up type (phone, email, meeting prep, other)
-- mysql -u root -p call_nest < server/schema/migrations/086_scheduled_callbacks_follow_up_type.sql
-- Or in MySQL: USE call_nest; source server/schema/migrations/086_scheduled_callbacks_follow_up_type.sql;
-- ============================================

ALTER TABLE scheduled_callbacks
  ADD COLUMN follow_up_type ENUM('callback', 'email', 'meeting', 'other') NOT NULL DEFAULT 'callback'
  AFTER status;
