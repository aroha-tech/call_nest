-- ============================================
-- Migration 072: Native calendar provider event references
-- mysql -u root -p call_nest < server/schema/migrations/072_meetings_provider_event_refs.sql
-- ============================================

USE call_nest;

ALTER TABLE tenant_meetings
  ADD COLUMN provider_event_id VARCHAR(255) NULL AFTER meeting_owner_user_id;

ALTER TABLE tenant_meetings
  ADD COLUMN provider_calendar_id VARCHAR(255) NULL AFTER provider_event_id;

ALTER TABLE tenant_meetings
  ADD INDEX idx_tm_provider_event (tenant_id, provider_event_id);

