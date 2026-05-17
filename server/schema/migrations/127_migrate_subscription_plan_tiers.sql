-- Align existing seeded / legacy rows with go / premium tier names (after 126).
--
-- Paste-ready:
--   USE call_nest;
--   SOURCE server/schema/migrations/127_migrate_subscription_plan_tiers.sql;
--
-- Shell:
--   mysql -u root -p call_nest < server/schema/migrations/127_migrate_subscription_plan_tiers.sql

UPDATE telephony_billing_plans
SET subscription_tier = 'go', name = 'Go — Monthly'
WHERE code = 'sub_credit_monthly' AND deleted_at IS NULL;

UPDATE telephony_billing_plans
SET subscription_tier = 'go', name = 'Go — Yearly'
WHERE code = 'sub_credit_yearly' AND deleted_at IS NULL;

UPDATE telephony_billing_plans
SET subscription_tier = 'go', name = 'Go Unlimited — Monthly'
WHERE code = 'sub_unlimited_monthly' AND deleted_at IS NULL;

UPDATE telephony_billing_plans
SET subscription_tier = 'go', name = 'Go Unlimited — Yearly'
WHERE code = 'sub_unlimited_yearly' AND deleted_at IS NULL;

UPDATE telephony_billing_plans
SET subscription_tier = 'go', plan_type = 'credit'
WHERE code IN ('credit_standard', 'credit_starter') AND deleted_at IS NULL;
