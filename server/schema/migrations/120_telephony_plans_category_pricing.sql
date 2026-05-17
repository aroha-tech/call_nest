-- Extend telephony_billing_plans: tenant billing vs credit purchase packs + pricing display.
--
-- Requires migration 119 (table telephony_billing_plans must exist).
--
-- Paste-ready (SQL editor) — run the whole file, or each ALTER one at a time:
--   USE call_nest;
--   SOURCE server/schema/migrations/120_telephony_plans_category_pricing.sql;
--
-- Shell (project root):
--   mysql -u root -p call_nest < server/schema/migrations/120_telephony_plans_category_pricing.sql
--
-- If a column already exists, skip that ALTER (duplicate column error = already applied).

ALTER TABLE telephony_billing_plans
  ADD COLUMN plan_category ENUM('tenant_billing', 'credit_purchase') NOT NULL DEFAULT 'tenant_billing'
    COMMENT 'tenant_billing = assign to tenant; credit_purchase = wallet top-up SKU for credit tenants'
    AFTER plan_type;

ALTER TABLE telephony_billing_plans
  ADD COLUMN billing_interval ENUM('month', 'year', 'one_time') NULL
    COMMENT 'Billing cycle label for purchase packs (credit_purchase). NULL for tenant_billing.'
    AFTER unlimited_minutes_cap_per_month;

ALTER TABLE telephony_billing_plans
  ADD COLUMN original_price_paise BIGINT UNSIGNED NULL
    COMMENT 'Strikethrough / list price shown to tenant admin before discount.'
    AFTER billing_interval;

ALTER TABLE telephony_billing_plans
  ADD COLUMN sale_price_paise BIGINT UNSIGNED NULL
    COMMENT 'Actual price tenant pays (checkout). For credit_purchase required when active.'
    AFTER original_price_paise;

ALTER TABLE telephony_billing_plans
  ADD COLUMN discount_percent TINYINT UNSIGNED NULL
    COMMENT 'Optional stored discount 0–100; can be derived from original vs sale price.'
    AFTER sale_price_paise;

ALTER TABLE telephony_billing_plans
  ADD COLUMN wallet_credit_paise BIGINT UNSIGNED NULL
    COMMENT 'Call wallet credit granted on purchase (credit_purchase only).'
    AFTER discount_percent;

-- No UPDATE needed: plan_category is NOT NULL DEFAULT 'tenant_billing', so existing rows get the default on ADD COLUMN.
