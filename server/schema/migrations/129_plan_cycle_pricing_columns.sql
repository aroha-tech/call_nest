-- One subscription plan row holds monthly / quarterly / 6-month / yearly prices (not separate plans per cycle).
--
-- Paste-ready:
--   USE call_nest;
--   SOURCE server/schema/migrations/129_plan_cycle_pricing_columns.sql;
--
-- Shell:
--   mysql -u root -p call_nest < server/schema/migrations/129_plan_cycle_pricing_columns.sql

ALTER TABLE telephony_billing_plans
  ADD COLUMN is_free_trial TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = free trial plan (no checkout).'
    AFTER subscription_tier;

ALTER TABLE telephony_billing_plans
  ADD COLUMN price_month_original_paise BIGINT UNSIGNED NULL AFTER discount_percent,
  ADD COLUMN price_month_sale_paise BIGINT UNSIGNED NULL AFTER price_month_original_paise,
  ADD COLUMN price_month_discount_percent TINYINT UNSIGNED NULL AFTER price_month_sale_paise,
  ADD COLUMN price_quarter_original_paise BIGINT UNSIGNED NULL AFTER price_month_discount_percent,
  ADD COLUMN price_quarter_sale_paise BIGINT UNSIGNED NULL AFTER price_quarter_original_paise,
  ADD COLUMN price_quarter_discount_percent TINYINT UNSIGNED NULL AFTER price_quarter_sale_paise,
  ADD COLUMN price_semiannual_original_paise BIGINT UNSIGNED NULL AFTER price_quarter_discount_percent,
  ADD COLUMN price_semiannual_sale_paise BIGINT UNSIGNED NULL AFTER price_semiannual_original_paise,
  ADD COLUMN price_semiannual_discount_percent TINYINT UNSIGNED NULL AFTER price_semiannual_sale_paise,
  ADD COLUMN price_year_original_paise BIGINT UNSIGNED NULL AFTER price_semiannual_discount_percent,
  ADD COLUMN price_year_sale_paise BIGINT UNSIGNED NULL AFTER price_year_original_paise,
  ADD COLUMN price_year_discount_percent TINYINT UNSIGNED NULL AFTER price_year_sale_paise;

-- Optional label only (not fixed Go/Premium/etc.) — admins set plan name freely.
ALTER TABLE telephony_billing_plans
  MODIFY COLUMN subscription_tier VARCHAR(64) NULL
    COMMENT 'Optional internal label; display name is in name column.';

UPDATE telephony_billing_plans
SET is_free_trial = 1
WHERE (subscription_tier = 'free' OR code LIKE '%free%')
  AND plan_category = 'tenant_billing'
  AND deleted_at IS NULL;

-- Copy legacy single-interval prices into cycle columns where empty.
UPDATE telephony_billing_plans
SET
  price_month_original_paise = COALESCE(price_month_original_paise, original_price_paise),
  price_month_sale_paise = COALESCE(price_month_sale_paise, sale_price_paise),
  price_month_discount_percent = COALESCE(price_month_discount_percent, discount_percent)
WHERE plan_category = 'tenant_billing'
  AND deleted_at IS NULL
  AND (billing_interval IS NULL OR billing_interval = 'month');

UPDATE telephony_billing_plans
SET
  price_quarter_original_paise = COALESCE(price_quarter_original_paise, original_price_paise),
  price_quarter_sale_paise = COALESCE(price_quarter_sale_paise, sale_price_paise),
  price_quarter_discount_percent = COALESCE(price_quarter_discount_percent, discount_percent)
WHERE plan_category = 'tenant_billing'
  AND billing_interval = 'quarter'
  AND deleted_at IS NULL;

UPDATE telephony_billing_plans
SET
  price_semiannual_original_paise = COALESCE(price_semiannual_original_paise, original_price_paise),
  price_semiannual_sale_paise = COALESCE(price_semiannual_sale_paise, sale_price_paise),
  price_semiannual_discount_percent = COALESCE(price_semiannual_discount_percent, discount_percent)
WHERE plan_category = 'tenant_billing'
  AND billing_interval = 'semiannual'
  AND deleted_at IS NULL;

UPDATE telephony_billing_plans
SET
  price_year_original_paise = COALESCE(price_year_original_paise, original_price_paise),
  price_year_sale_paise = COALESCE(price_year_sale_paise, sale_price_paise),
  price_year_discount_percent = COALESCE(price_year_discount_percent, discount_percent)
WHERE plan_category = 'tenant_billing'
  AND billing_interval = 'year'
  AND deleted_at IS NULL;

ALTER TABLE tenant_telephony_subscription_orders
  ADD COLUMN billing_interval ENUM('month', 'quarter', 'semiannual', 'year') NULL
    COMMENT 'Cycle chosen at checkout.'
    AFTER telephony_billing_plan_id;

ALTER TABLE tenant_telephony_subscriptions
  ADD COLUMN billing_interval ENUM('month', 'quarter', 'semiannual', 'year') NULL
    COMMENT 'Active billing cycle for this period.'
    AFTER telephony_billing_plan_id;
