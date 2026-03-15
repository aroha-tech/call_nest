-- WhatsApp automation flag, template cooldown, and send_mode on messages
--
-- From project root, run:
--   mysql -u root -p call_nest < server/schema/migrations/010_whatsapp_automation_and_cooldown.sql
--
-- Or inside MySQL:
--   USE call_nest;
--   SOURCE server/schema/migrations/010_whatsapp_automation_and_cooldown.sql;

-- 1) Tenant-level automation flag: whether WhatsApp automation (provider API) is enabled
ALTER TABLE tenants
  ADD COLUMN whatsapp_automation_enabled TINYINT(1) NOT NULL DEFAULT 0
  AFTER whatsapp_send_mode;

-- 2) Template cooldown fields (hours/days between sends for same contact + template)
ALTER TABLE whatsapp_business_templates
  ADD COLUMN cooldown_days INT NULL AFTER template_mode,
  ADD COLUMN cooldown_hours INT NULL AFTER cooldown_days;

-- 3) Message send mode: automatic (provider API) vs manual (wa.me / manual sending)
ALTER TABLE whatsapp_messages
  ADD COLUMN send_mode ENUM('automatic','manual') NOT NULL DEFAULT 'automatic'
  AFTER status;

