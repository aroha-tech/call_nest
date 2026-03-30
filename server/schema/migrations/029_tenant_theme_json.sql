-- Per-tenant white-label UI (colors, logo, optional title/radius/font) — managed from Super Admin.
-- Apply from project root:
--   mysql -u root -p call_nest < server/schema/migrations/029_tenant_theme_json.sql
-- Or in MySQL after USE call_nest:
--   source server/schema/migrations/029_tenant_theme_json.sql

ALTER TABLE tenants
  ADD COLUMN theme_json JSON NULL COMMENT 'Tenant UI theme (JSON object; null = platform defaults)' AFTER email_automation_enabled;
