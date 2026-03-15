-- Tenant-level email module flags (same pattern as WhatsApp)
-- email_module_enabled: when 0, hide entire email module for this client (not purchased).
-- email_automation_enabled: for future use (automation feature).
--
-- From project root:
--   mysql -u root -p call_nest < server/schema/migrations/018_tenant_email_module_flags.sql
-- Or inside MySQL:
--   USE call_nest;
--   SOURCE server/schema/migrations/018_tenant_email_module_flags.sql;

ALTER TABLE tenants
  ADD COLUMN email_module_enabled TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = client can use email module (purchased); 0 = hide email module'
    AFTER email_communication_enabled,
  ADD COLUMN email_automation_enabled TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = email automation enabled (future use)'
    AFTER email_module_enabled;
