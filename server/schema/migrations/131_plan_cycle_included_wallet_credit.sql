-- Per billing-cycle included wallet credit on subscription plans (mirrors cycle price columns).
--
-- Paste-ready (run each block in SQL editor; safe if a column already exists — skip that ALTER).
--
--   USE call_nest;

-- Add columns one at a time (MySQL cannot use AFTER <new_column> within the same ALTER).

ALTER TABLE telephony_billing_plans
  ADD COLUMN included_wallet_credit_month_paise BIGINT UNSIGNED NULL
    COMMENT 'Included call wallet credit when billing cycle is monthly.'
    AFTER included_wallet_credit_paise;

ALTER TABLE telephony_billing_plans
  ADD COLUMN included_wallet_credit_quarter_paise BIGINT UNSIGNED NULL
    COMMENT 'Included call wallet credit when billing cycle is quarterly.'
    AFTER included_wallet_credit_month_paise;

ALTER TABLE telephony_billing_plans
  ADD COLUMN included_wallet_credit_semiannual_paise BIGINT UNSIGNED NULL
    COMMENT 'Included call wallet credit when billing cycle is 6-month.'
    AFTER included_wallet_credit_quarter_paise;

ALTER TABLE telephony_billing_plans
  ADD COLUMN included_wallet_credit_year_paise BIGINT UNSIGNED NULL
    COMMENT 'Included call wallet credit when billing cycle is yearly.'
    AFTER included_wallet_credit_semiannual_paise;

-- Copy legacy single value into monthly column where empty.
UPDATE telephony_billing_plans
SET included_wallet_credit_month_paise = COALESCE(
      included_wallet_credit_month_paise,
      included_wallet_credit_paise
    )
WHERE plan_category = 'tenant_billing'
  AND deleted_at IS NULL
  AND included_wallet_credit_paise IS NOT NULL;

-- Yearly = monthly × 12 × 1.1 (10% bonus) when year column still empty.
UPDATE telephony_billing_plans
SET included_wallet_credit_year_paise = ROUND(included_wallet_credit_month_paise * 12 * 1.1)
WHERE plan_category = 'tenant_billing'
  AND deleted_at IS NULL
  AND included_wallet_credit_month_paise IS NOT NULL
  AND included_wallet_credit_month_paise > 0
  AND included_wallet_credit_year_paise IS NULL;
