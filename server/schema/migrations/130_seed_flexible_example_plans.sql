-- Example starter plans (one row each, all billing cycles on the same plan).
-- NOT fixed names — edit or add more plans in Admin anytime.
-- Safe to re-run (skips existing codes).
--
-- Requires 129 (cycle price columns).
--
-- Paste-ready:
--   USE call_nest;
--   SOURCE server/schema/migrations/130_seed_flexible_example_plans.sql;

-- Free trial (credit)
INSERT INTO telephony_billing_plans (
  code, name, description, plan_type, plan_category, is_free_trial, trial_duration_days,
  included_wallet_credit_paise, call_rate_paise_per_minute, byo_platform_fee_paise_per_minute,
  call_min_balance_paise, seat_limit_admins, seat_limit_managers, seat_limit_users,
  features_html, sort_order, is_active
)
SELECT
  'plan_free',
  'Free',
  'Time-limited trial with included call credits.',
  'credit', 'tenant_billing', 1, 14, 50000,
  100, 25, 100, 1, 1, 3,
  '<ul><li>14-day trial</li><li>Included call credits</li></ul>',
  5, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM telephony_billing_plans WHERE code = 'plan_free' AND deleted_at IS NULL);

-- Credit plan (example name — rename in admin)
INSERT INTO telephony_billing_plans (
  code, name, description, plan_type, plan_category,
  price_month_original_paise, price_month_sale_paise, price_month_discount_percent,
  price_quarter_original_paise, price_quarter_sale_paise, price_quarter_discount_percent,
  price_semiannual_original_paise, price_semiannual_sale_paise, price_semiannual_discount_percent,
  price_year_original_paise, price_year_sale_paise, price_year_discount_percent,
  included_wallet_credit_paise, call_rate_paise_per_minute, byo_platform_fee_paise_per_minute,
  call_min_balance_paise, seat_limit_admins, seat_limit_managers, seat_limit_users,
  features_html, sort_order, is_active
)
SELECT
  'plan_credit_starter',
  'Starter',
  'Credit-based calling. Top up with credit packs anytime.',
  'credit', 'tenant_billing',
  199900, 99900, 50,
  299700, 269900, 10,
  599400, 499900, 17,
  2398800, 999900, 58,
  100000, 100, 25, 100, 2, 5, 25,
  '<ul><li>Wallet credits included each period</li><li>Per-minute rates</li></ul>',
  10, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM telephony_billing_plans WHERE code = 'plan_credit_starter' AND deleted_at IS NULL);

-- Unlimited plan (example)
INSERT INTO telephony_billing_plans (
  code, name, description, plan_type, plan_category,
  price_month_original_paise, price_month_sale_paise, price_month_discount_percent,
  price_quarter_original_paise, price_quarter_sale_paise, price_quarter_discount_percent,
  price_semiannual_original_paise, price_semiannual_sale_paise, price_semiannual_discount_percent,
  price_year_original_paise, price_year_sale_paise, price_year_discount_percent,
  unlimited_minutes_cap_per_month, seat_limit_admins, seat_limit_managers, seat_limit_users,
  features_html, sort_order, is_active
)
SELECT
  'plan_unlimited_pro',
  'Pro Unlimited',
  'Connected minutes included up to monthly cap.',
  'unlimited', 'tenant_billing',
  149900, 99900, 33,
  299700, 269900, 10,
  599400, 499900, 17,
  1798800, 999900, 44,
  5000, 2, 5, 25,
  '<ul><li>5,000 min / month</li></ul>',
  30, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM telephony_billing_plans WHERE code = 'plan_unlimited_pro' AND deleted_at IS NULL);

-- Enterprise / contact sales (credit)
INSERT INTO telephony_billing_plans (
  code, name, description, plan_type, plan_category, is_contact_sales,
  call_rate_paise_per_minute, byo_platform_fee_paise_per_minute, call_min_balance_paise,
  features_html, sort_order, is_active
)
SELECT
  'plan_enterprise',
  'Enterprise',
  'Custom contract — contact sales.',
  'credit', 'tenant_billing', 1,
  100, 25, 100,
  '<p>Contact your account manager.</p>',
  50, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM telephony_billing_plans WHERE code = 'plan_enterprise' AND deleted_at IS NULL);

-- Hide duplicate per-cycle rows if migration 128 was applied earlier
UPDATE telephony_billing_plans
SET is_active = 0, deleted_at = COALESCE(deleted_at, NOW())
WHERE plan_category = 'tenant_billing'
  AND code IN (
    'credit_go_quarter', 'credit_go_semiannual', 'credit_premium_month', 'credit_premium_quarter',
    'credit_premium_semiannual', 'credit_premium_year', 'unlimited_go_quarter', 'unlimited_go_semiannual',
    'unlimited_premium_month', 'unlimited_premium_quarter', 'unlimited_premium_semiannual', 'unlimited_premium_year'
  )
  AND deleted_at IS NULL;
