-- Tenant WhatsApp send mode flag
-- Adds whatsapp_send_mode column to tenants table
--
-- From project root, run:
--   mysql -u root -p call_nest < server/schema/migrations/008_tenant_whatsapp_mode.sql
--

ALTER TABLE tenants
  ADD COLUMN whatsapp_send_mode ENUM('manual','automatic') NOT NULL DEFAULT 'manual' AFTER updated_at;

