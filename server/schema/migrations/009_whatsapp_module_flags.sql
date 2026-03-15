-- WhatsApp module flags and modes
-- - Adds whatsapp_module_enabled to tenants (super admin controls purchase)
-- - Adds account_type to whatsapp_accounts (provider vs non_provider)
-- - Adds template_mode to whatsapp_business_templates (automatic vs manual)
--
-- From project root, run:
--   mysql -u root -p call_nest < server/schema/migrations/009_whatsapp_module_flags.sql
--
-- Or inside MySQL:
--   USE call_nest;
--   SOURCE server/schema/migrations/009_whatsapp_module_flags.sql;

-- 1) Tenant-level flag: whether WhatsApp module is purchased/enabled (super admin).
--    Reserved for future use: e.g. hide entire WhatsApp section when 0. Currently unused;
--    automation/API access is controlled by whatsapp_automation_enabled (migration 010).
ALTER TABLE tenants
  ADD COLUMN whatsapp_module_enabled TINYINT(1) NOT NULL DEFAULT 0
  AFTER whatsapp_send_mode;

-- 2) Account type: provider vs non-provider (manual only)
ALTER TABLE whatsapp_accounts
  ADD COLUMN account_type ENUM('provider','non_provider') NOT NULL DEFAULT 'provider'
  AFTER provider;

-- 3) Template mode: automatic (uses provider) vs manual (WhatsApp Web/manual)
ALTER TABLE whatsapp_business_templates
  ADD COLUMN template_mode ENUM('automatic','manual') NOT NULL DEFAULT 'automatic'
  AFTER status;

