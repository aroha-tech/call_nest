-- Full subscription catalog: credit (Free, Go, Premium, Enterprise) + unlimited (Go, Premium)
-- × billing cycles (month, quarter, semiannual, year). Safe to re-run (skips existing codes).
--
-- Requires migration 126 (quarter / semiannual intervals + go / premium tiers).
-- Run 127 first if you have old 124 seeds (renames sub_credit_* → Go tier).
--
-- Paste-ready (SQL editor) — run the whole file after:
--   USE call_nest;
--
-- Or file-based (project root):
--   mysql -u root -p call_nest < server/schema/migrations/126_telephony_plan_tiers_intervals.sql
--   mysql -u root -p call_nest < server/schema/migrations/127_migrate_subscription_plan_tiers.sql
--   mysql -u root -p call_nest < server/schema/migrations/128_seed_subscription_catalog_matrix.sql

-- ─── Align existing rows ─────────────────────────────────────────────────────

UPDATE telephony_billing_plans
SET subscription_tier = 'free', name = 'Free', plan_type = 'credit'
WHERE code = 'sub_free_trial' AND deleted_at IS NULL;

UPDATE telephony_billing_plans
SET subscription_tier = 'go', name = 'Go — Monthly'
WHERE code = 'sub_credit_monthly' AND deleted_at IS NULL;

UPDATE telephony_billing_plans
SET subscription_tier = 'go', name = 'Go — Yearly', billing_interval = 'year'
WHERE code = 'sub_credit_yearly' AND deleted_at IS NULL;

UPDATE telephony_billing_plans
SET subscription_tier = 'go', name = 'Go Unlimited — Monthly'
WHERE code = 'sub_unlimited_monthly' AND deleted_at IS NULL;

UPDATE telephony_billing_plans
SET subscription_tier = 'go', name = 'Go Unlimited — Yearly', billing_interval = 'year'
WHERE code = 'sub_unlimited_yearly' AND deleted_at IS NULL;

UPDATE telephony_billing_plans
SET subscription_tier = 'enterprise',
    plan_type = 'credit',
    name = 'Enterprise',
    is_contact_sales = 1,
    billing_interval = 'year'
WHERE code = 'sub_enterprise' AND deleted_at IS NULL;

UPDATE telephony_billing_plans
SET subscription_tier = 'enterprise', is_active = 0
WHERE code = 'sub_custom' AND deleted_at IS NULL;

-- Legacy rate templates (not part of the new catalog matrix)
UPDATE telephony_billing_plans
SET is_active = 0, subscription_tier = 'go'
WHERE code IN ('credit_standard', 'credit_starter') AND deleted_at IS NULL;

UPDATE telephony_billing_plans SET subscription_tier = 'go' WHERE subscription_tier = 'standard' AND deleted_at IS NULL;
UPDATE telephony_billing_plans SET subscription_tier = 'enterprise' WHERE subscription_tier = 'custom' AND deleted_at IS NULL;

-- ─── Credit · Go (quarter + 6-month; month/year may already exist as sub_credit_*) ─

INSERT INTO telephony_billing_plans (
  code, name, description, plan_type, plan_category, subscription_tier,
  billing_interval, included_wallet_credit_paise,
  original_price_paise, sale_price_paise, discount_percent,
  call_rate_paise_per_minute, byo_platform_fee_paise_per_minute, call_min_balance_paise,
  seat_limit_admins, seat_limit_managers, seat_limit_users,
  features_html, is_contact_sales, sort_order, is_active
)
SELECT
  'credit_go_quarter',
  'Go — Quarterly',
  'Credit-based calling billed every 3 months. Includes wallet credit and per-minute rates.',
  'credit', 'tenant_billing', 'go',
  'quarter', 270000,
  299700, 269900, 10,
  100, 25, 100,
  2, 5, 25,
  '<ul><li>₹2,700 wallet credit / quarter</li><li>2 admins · 5 managers · 25 users</li><li>Credit top-up packs available</li></ul>',
  0, 11, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM telephony_billing_plans WHERE code = 'credit_go_quarter' AND deleted_at IS NULL);

INSERT INTO telephony_billing_plans (
  code, name, description, plan_type, plan_category, subscription_tier,
  billing_interval, included_wallet_credit_paise,
  original_price_paise, sale_price_paise, discount_percent,
  call_rate_paise_per_minute, byo_platform_fee_paise_per_minute, call_min_balance_paise,
  seat_limit_admins, seat_limit_managers, seat_limit_users,
  features_html, is_contact_sales, sort_order, is_active
)
SELECT
  'credit_go_semiannual',
  'Go — 6 months',
  'Credit-based calling billed every 6 months.',
  'credit', 'tenant_billing', 'go',
  'semiannual', 500000,
  599400, 499900, 17,
  100, 25, 100,
  2, 5, 30,
  '<ul><li>₹5,000 wallet credit / 6 months</li><li>2 admins · 5 managers · 30 users</li></ul>',
  0, 12, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM telephony_billing_plans WHERE code = 'credit_go_semiannual' AND deleted_at IS NULL);

-- ─── Credit · Premium (all four cycles) ─────────────────────────────────────

INSERT INTO telephony_billing_plans (
  code, name, description, plan_type, plan_category, subscription_tier,
  billing_interval, included_wallet_credit_paise,
  original_price_paise, sale_price_paise, discount_percent,
  call_rate_paise_per_minute, byo_platform_fee_paise_per_minute, call_min_balance_paise,
  seat_limit_admins, seat_limit_managers, seat_limit_users,
  features_html, is_contact_sales, sort_order, is_active
)
SELECT
  'credit_premium_month',
  'Premium — Monthly',
  'Higher included credits and seats for growing sales teams.',
  'credit', 'tenant_billing', 'premium',
  'month', 200000,
  399900, 199900, 50,
  90, 25, 100,
  3, 10, 50,
  '<ul><li>₹2,000 wallet credit / month</li><li>3 admins · 10 managers · 50 users</li><li>Lower per-minute rate</li></ul>',
  0, 20, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM telephony_billing_plans WHERE code = 'credit_premium_month' AND deleted_at IS NULL);

INSERT INTO telephony_billing_plans (
  code, name, description, plan_type, plan_category, subscription_tier,
  billing_interval, included_wallet_credit_paise,
  original_price_paise, sale_price_paise, discount_percent,
  call_rate_paise_per_minute, byo_platform_fee_paise_per_minute, call_min_balance_paise,
  seat_limit_admins, seat_limit_managers, seat_limit_users,
  features_html, is_contact_sales, sort_order, is_active
)
SELECT
  'credit_premium_quarter',
  'Premium — Quarterly',
  'Premium credit plan billed every 3 months.',
  'credit', 'tenant_billing', 'premium',
  'quarter', 550000,
  599700, 539900, 10,
  90, 25, 100,
  3, 10, 50,
  '<ul><li>₹5,500 wallet credit / quarter</li><li>3 admins · 10 managers · 50 users</li></ul>',
  0, 21, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM telephony_billing_plans WHERE code = 'credit_premium_quarter' AND deleted_at IS NULL);

INSERT INTO telephony_billing_plans (
  code, name, description, plan_type, plan_category, subscription_tier,
  billing_interval, included_wallet_credit_paise,
  original_price_paise, sale_price_paise, discount_percent,
  call_rate_paise_per_minute, byo_platform_fee_paise_per_minute, call_min_balance_paise,
  seat_limit_admins, seat_limit_managers, seat_limit_users,
  features_html, is_contact_sales, sort_order, is_active
)
SELECT
  'credit_premium_semiannual',
  'Premium — 6 months',
  'Premium credit plan billed every 6 months.',
  'credit', 'tenant_billing', 'premium',
  'semiannual', 1000000,
  1199400, 999900, 17,
  90, 25, 100,
  4, 12, 60,
  '<ul><li>₹10,000 wallet credit / 6 months</li><li>4 admins · 12 managers · 60 users</li></ul>',
  0, 22, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM telephony_billing_plans WHERE code = 'credit_premium_semiannual' AND deleted_at IS NULL);

INSERT INTO telephony_billing_plans (
  code, name, description, plan_type, plan_category, subscription_tier,
  billing_interval, included_wallet_credit_paise,
  original_price_paise, sale_price_paise, discount_percent,
  call_rate_paise_per_minute, byo_platform_fee_paise_per_minute, call_min_balance_paise,
  seat_limit_admins, seat_limit_managers, seat_limit_users,
  features_html, is_contact_sales, sort_order, is_active
)
SELECT
  'credit_premium_year',
  'Premium — Yearly',
  'Best value premium credit plan on an annual contract.',
  'credit', 'tenant_billing', 'premium',
  'year', 2500000,
  3598800, 1799900, 50,
  90, 25, 100,
  5, 15, 75,
  '<ul><li>₹25,000 wallet credit / year</li><li>5 admins · 15 managers · 75 users</li><li>Priority support</li></ul>',
  0, 23, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM telephony_billing_plans WHERE code = 'credit_premium_year' AND deleted_at IS NULL);

-- ─── Unlimited · Go (quarter + 6-month) ─────────────────────────────────────

INSERT INTO telephony_billing_plans (
  code, name, description, plan_type, plan_category, subscription_tier,
  billing_interval, unlimited_minutes_cap_per_month,
  original_price_paise, sale_price_paise, discount_percent,
  seat_limit_admins, seat_limit_managers, seat_limit_users,
  features_html, is_contact_sales, sort_order, is_active
)
SELECT
  'unlimited_go_quarter',
  'Go Unlimited — Quarterly',
  'Unlimited connected minutes (cap applies) billed every 3 months.',
  'unlimited', 'tenant_billing', 'go',
  'quarter', 5000,
  299700, 269900, 10,
  2, 5, 25,
  '<ul><li>5,000 min / month cap</li><li>2 admins · 5 managers · 25 users</li></ul>',
  0, 31, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM telephony_billing_plans WHERE code = 'unlimited_go_quarter' AND deleted_at IS NULL);

INSERT INTO telephony_billing_plans (
  code, name, description, plan_type, plan_category, subscription_tier,
  billing_interval, unlimited_minutes_cap_per_month,
  original_price_paise, sale_price_paise, discount_percent,
  seat_limit_admins, seat_limit_managers, seat_limit_users,
  features_html, is_contact_sales, sort_order, is_active
)
SELECT
  'unlimited_go_semiannual',
  'Go Unlimited — 6 months',
  'Unlimited connected minutes billed every 6 months.',
  'unlimited', 'tenant_billing', 'go',
  'semiannual', 5000,
  599400, 499900, 17,
  2, 5, 30,
  '<ul><li>5,000 min / month cap</li><li>2 admins · 5 managers · 30 users</li></ul>',
  0, 32, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM telephony_billing_plans WHERE code = 'unlimited_go_semiannual' AND deleted_at IS NULL);

-- ─── Unlimited · Premium (all four cycles) ──────────────────────────────────

INSERT INTO telephony_billing_plans (
  code, name, description, plan_type, plan_category, subscription_tier,
  billing_interval, unlimited_minutes_cap_per_month,
  original_price_paise, sale_price_paise, discount_percent,
  seat_limit_admins, seat_limit_managers, seat_limit_users,
  features_html, is_contact_sales, sort_order, is_active
)
SELECT
  'unlimited_premium_month',
  'Premium Unlimited — Monthly',
  'Higher minute cap and seats for high-volume outbound teams.',
  'unlimited', 'tenant_billing', 'premium',
  'month', 10000,
  249900, 149900, 40,
  3, 10, 50,
  '<ul><li>10,000 min / month cap</li><li>3 admins · 10 managers · 50 users</li></ul>',
  0, 40, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM telephony_billing_plans WHERE code = 'unlimited_premium_month' AND deleted_at IS NULL);

INSERT INTO telephony_billing_plans (
  code, name, description, plan_type, plan_category, subscription_tier,
  billing_interval, unlimited_minutes_cap_per_month,
  original_price_paise, sale_price_paise, discount_percent,
  seat_limit_admins, seat_limit_managers, seat_limit_users,
  features_html, is_contact_sales, sort_order, is_active
)
SELECT
  'unlimited_premium_quarter',
  'Premium Unlimited — Quarterly',
  'Premium unlimited plan billed every 3 months.',
  'unlimited', 'tenant_billing', 'premium',
  'quarter', 10000,
  449700, 399900, 11,
  3, 10, 50,
  '<ul><li>10,000 min / month cap</li><li>3 admins · 10 managers · 50 users</li></ul>',
  0, 41, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM telephony_billing_plans WHERE code = 'unlimited_premium_quarter' AND deleted_at IS NULL);

INSERT INTO telephony_billing_plans (
  code, name, description, plan_type, plan_category, subscription_tier,
  billing_interval, unlimited_minutes_cap_per_month,
  original_price_paise, sale_price_paise, discount_percent,
  seat_limit_admins, seat_limit_managers, seat_limit_users,
  features_html, is_contact_sales, sort_order, is_active
)
SELECT
  'unlimited_premium_semiannual',
  'Premium Unlimited — 6 months',
  'Premium unlimited plan billed every 6 months.',
  'unlimited', 'tenant_billing', 'premium',
  'semiannual', 10000,
  899400, 749900, 17,
  4, 12, 60,
  '<ul><li>10,000 min / month cap</li><li>4 admins · 12 managers · 60 users</li></ul>',
  0, 42, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM telephony_billing_plans WHERE code = 'unlimited_premium_semiannual' AND deleted_at IS NULL);

INSERT INTO telephony_billing_plans (
  code, name, description, plan_type, plan_category, subscription_tier,
  billing_interval, unlimited_minutes_cap_per_month,
  original_price_paise, sale_price_paise, discount_percent,
  seat_limit_admins, seat_limit_managers, seat_limit_users,
  features_html, is_contact_sales, sort_order, is_active
)
SELECT
  'unlimited_premium_year',
  'Premium Unlimited — Yearly',
  'Annual premium unlimited calling for large teams.',
  'unlimited', 'tenant_billing', 'premium',
  'year', 12000,
  2398800, 1399900, 42,
  5, 15, 100,
  '<ul><li>12,000 min / month cap</li><li>5 admins · 15 managers · 100 users</li></ul>',
  0, 43, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM telephony_billing_plans WHERE code = 'unlimited_premium_year' AND deleted_at IS NULL);
