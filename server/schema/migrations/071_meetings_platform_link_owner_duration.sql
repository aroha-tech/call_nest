-- ============================================
-- Migration 071: Meeting platform/link/owner/duration
-- mysql -u root -p call_nest < server/schema/migrations/071_meetings_platform_link_owner_duration.sql
-- ============================================

USE call_nest;

ALTER TABLE tenant_meetings
  ADD COLUMN meeting_platform ENUM('google_meet', 'microsoft_teams', 'custom') NOT NULL DEFAULT 'google_meet' AFTER meeting_status;

ALTER TABLE tenant_meetings
  ADD COLUMN meeting_link VARCHAR(1000) NULL AFTER meeting_platform;

ALTER TABLE tenant_meetings
  ADD COLUMN meeting_duration_min INT UNSIGNED NOT NULL DEFAULT 30 AFTER meeting_link;

ALTER TABLE tenant_meetings
  ADD COLUMN meeting_owner_user_id BIGINT UNSIGNED NULL AFTER meeting_duration_min;

ALTER TABLE tenant_meetings
  ADD CONSTRAINT fk_tm_meeting_owner_user
  FOREIGN KEY (meeting_owner_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE tenant_meetings
  ADD INDEX idx_tm_platform (tenant_id, meeting_platform);

ALTER TABLE tenant_meetings
  ADD INDEX idx_tm_owner (tenant_id, meeting_owner_user_id);

