-- ============================================
-- Migration 111: Default CC/BCC on per-user meeting email settings
--
-- MySQL does not allow ADD COLUMN ... AFTER <new_column> when both adds are in
-- the same ALTER (the new column is not visible yet). Use two ALTERs.
--
-- Paste-ready SQL for SQL editors:
--   USE call_nest;
--   ALTER TABLE tenant_user_meeting_email_settings
--     ADD COLUMN default_cc_email VARCHAR(1000) NULL DEFAULT NULL AFTER include_meeting_details;
--   ALTER TABLE tenant_user_meeting_email_settings
--     ADD COLUMN default_bcc_email VARCHAR(1000) NULL DEFAULT NULL AFTER default_cc_email;
--
-- File-based run from project root:
--   mysql -u root -p call_nest < server/schema/migrations/111_tenant_user_meeting_email_default_cc_bcc.sql
--   -- or inside MySQL after USE call_nest;
--   source server/schema/migrations/111_tenant_user_meeting_email_default_cc_bcc.sql
-- ============================================

ALTER TABLE tenant_user_meeting_email_settings
  ADD COLUMN default_cc_email VARCHAR(1000) NULL DEFAULT NULL AFTER include_meeting_details;

ALTER TABLE tenant_user_meeting_email_settings
  ADD COLUMN default_bcc_email VARCHAR(1000) NULL DEFAULT NULL AFTER default_cc_email;
