-- ============================================
-- Migration 113: Per–email-type default CC/BCC (JSON on tenant_user_meeting_email_settings)
--
-- Paste-ready SQL for SQL editors:
--   USE call_nest;
--   ALTER TABLE tenant_user_meeting_email_settings
--     ADD COLUMN default_cc_bcc_json JSON NULL DEFAULT NULL
--     COMMENT 'Per type: {created:{cc,bcc},reminder:{},...}'
--     AFTER default_bcc_email;
--
-- File-based run from project root:
--   mysql -u root -p call_nest < server/schema/migrations/113_tenant_user_meeting_email_cc_bcc_by_kind.sql
-- ============================================

ALTER TABLE tenant_user_meeting_email_settings
  ADD COLUMN default_cc_bcc_json JSON NULL DEFAULT NULL
  COMMENT 'Per email-type CC/BCC: {created:{cc,bcc},reminder:{},feedback:{},updated:{},cancelled:{}}'
  AFTER default_bcc_email;
