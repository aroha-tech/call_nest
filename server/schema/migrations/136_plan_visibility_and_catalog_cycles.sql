-- Plan catalog visibility (website vs tenant panel) and subscription cycle toggles.
--
-- Paste-ready (SQL editor) — run each block in order (TiDB/MySQL cannot use AFTER
-- a column that is created in the same ALTER statement):
--   USE call_nest;
--
-- File-based:
--   mysql -u root -p call_nest < server/schema/migrations/136_plan_visibility_and_catalog_cycles.sql

ALTER TABLE telephony_billing_plans
  ADD COLUMN visible_on_website TINYINT(1) NOT NULL DEFAULT 1
    COMMENT 'Show on public marketing website' AFTER is_active;

ALTER TABLE telephony_billing_plans
  ADD COLUMN visible_on_panel TINYINT(1) NOT NULL DEFAULT 1
    COMMENT 'Show in tenant admin billing panel' AFTER visible_on_website;

INSERT INTO platform_settings (setting_key, setting_value)
SELECT
  'billing.subscription_cycles_visible',
  CAST('{"month":true,"quarter":true,"semiannual":true,"year":true}' AS JSON)
WHERE NOT EXISTS (
  SELECT 1 FROM platform_settings WHERE setting_key = 'billing.subscription_cycles_visible'
);
