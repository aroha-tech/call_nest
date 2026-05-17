-- Plan catalog structure: credit tiers (free/go/premium/enterprise) and billing cycles
-- (month, quarter, semiannual, year). Migrates legacy standard → go, custom → enterprise.
--
-- Paste-ready:
--   USE call_nest;
--   SOURCE server/schema/migrations/126_telephony_plan_tiers_intervals.sql;
--
-- Shell (project root):
--   mysql -u root -p call_nest < server/schema/migrations/126_telephony_plan_tiers_intervals.sql

ALTER TABLE telephony_billing_plans
  MODIFY COLUMN billing_interval ENUM('month', 'quarter', 'semiannual', 'year', 'one_time') NULL
    COMMENT 'Billing cycle: month, quarter (3mo), semiannual (6mo), year, or one_time (top-up packs)';

ALTER TABLE telephony_billing_plans
  MODIFY COLUMN subscription_tier ENUM('free', 'go', 'premium', 'enterprise', 'standard', 'custom') NOT NULL DEFAULT 'go'
    COMMENT 'free/go/premium/enterprise for credit; go/premium for unlimited';

UPDATE telephony_billing_plans
SET subscription_tier = 'go'
WHERE subscription_tier = 'standard' AND deleted_at IS NULL;

UPDATE telephony_billing_plans
SET subscription_tier = 'enterprise'
WHERE subscription_tier = 'custom' AND deleted_at IS NULL;

-- Enterprise is credit-only (custom / contact sales); unlimited catalog uses go + premium only.
UPDATE telephony_billing_plans
SET plan_type = 'credit'
WHERE subscription_tier = 'enterprise' AND plan_type = 'unlimited' AND deleted_at IS NULL;

ALTER TABLE telephony_billing_plans
  MODIFY COLUMN subscription_tier ENUM('free', 'go', 'premium', 'enterprise') NOT NULL DEFAULT 'go'
    COMMENT 'Credit: free, go, premium, enterprise. Unlimited: go, premium.';
