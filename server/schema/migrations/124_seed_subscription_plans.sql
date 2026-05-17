-- Seed main subscription plans (tenant_billing) for website / tenant purchase.
-- Requires 119, 120, 123.
--
-- Paste-ready:
--   USE call_nest;
--   SOURCE server/schema/migrations/124_seed_subscription_plans.sql;

-- Free trial (credit telephony, limited days + included credits)
INSERT INTO telephony_billing_plans (
  code, name, description, plan_type, plan_category, subscription_tier,
  billing_interval, trial_duration_days, included_wallet_credit_paise,
  original_price_paise, sale_price_paise, discount_percent,
  call_rate_paise_per_minute, byo_platform_fee_paise_per_minute, call_min_balance_paise,
  seat_limit_admins, seat_limit_managers, seat_limit_users,
  features_html, is_contact_sales, sort_order, is_active
)
SELECT
  'sub_free_trial',
  'Free trial',
  'Try CallXTime with included call credits and a time-limited trial.',
  'credit', 'tenant_billing', 'free',
  'month', 14, 50000,
  0, 0, NULL,
  100, 25, 100,
  1, 1, 3,
  '<ul><li>14-day trial</li><li>₹500 call credits included</li><li>1 admin, 1 manager, 3 users</li><li>Platform Exotel calling</li></ul>',
  0, 5, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM telephony_billing_plans WHERE code = 'sub_free_trial' AND deleted_at IS NULL);

-- Credit — monthly
INSERT INTO telephony_billing_plans (
  code, name, description, plan_type, plan_category, subscription_tier,
  billing_interval, included_wallet_credit_paise,
  original_price_paise, sale_price_paise, discount_percent,
  call_rate_paise_per_minute, byo_platform_fee_paise_per_minute, call_min_balance_paise,
  seat_limit_admins, seat_limit_managers, seat_limit_users,
  features_html, is_contact_sales, sort_order, is_active
)
SELECT
  'sub_credit_monthly',
  'Credit — Monthly',
  'Pay per minute from your wallet. Top up anytime with credit packs.',
  'credit', 'tenant_billing', 'standard',
  'month', 100000,
  199900, 99900, 50,
  100, 25, 100,
  2, 5, 25,
  '<ul><li>₹1,000 wallet credit included / month</li><li>2 admins · 5 managers · 25 users</li><li>Credit packs available for top-up</li></ul>',
  0, 10, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM telephony_billing_plans WHERE code = 'sub_credit_monthly' AND deleted_at IS NULL);

-- Credit — yearly
INSERT INTO telephony_billing_plans (
  code, name, description, plan_type, plan_category, subscription_tier,
  billing_interval, included_wallet_credit_paise,
  original_price_paise, sale_price_paise, discount_percent,
  call_rate_paise_per_minute, byo_platform_fee_paise_per_minute, call_min_balance_paise,
  seat_limit_admins, seat_limit_managers, seat_limit_users,
  features_html, is_contact_sales, sort_order, is_active
)
SELECT
  'sub_credit_yearly',
  'Credit — Yearly',
  'Best value for credit-based calling teams on an annual plan.',
  'credit', 'tenant_billing', 'standard',
  'year', 1500000,
  2398800, 999900, 58,
  100, 25, 100,
  3, 10, 50,
  '<ul><li>₹15,000 wallet credit included / year</li><li>3 admins · 10 managers · 50 users</li><li>Priority email support</li></ul>',
  0, 20, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM telephony_billing_plans WHERE code = 'sub_credit_yearly' AND deleted_at IS NULL);

-- Unlimited — monthly
INSERT INTO telephony_billing_plans (
  code, name, description, plan_type, plan_category, subscription_tier,
  billing_interval, unlimited_minutes_cap_per_month,
  original_price_paise, sale_price_paise, discount_percent,
  seat_limit_admins, seat_limit_managers, seat_limit_users,
  features_html, is_contact_sales, sort_order, is_active
)
SELECT
  'sub_unlimited_monthly',
  'Unlimited — Monthly',
  'Connected minutes included up to your monthly cap. No per-minute wallet debit.',
  'unlimited', 'tenant_billing', 'standard',
  'month', 5000,
  149900, 99900, 33,
  2, 5, 25,
  '<ul><li>5,000 connected minutes / month</li><li>2 admins · 5 managers · 25 users</li></ul>',
  0, 30, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM telephony_billing_plans WHERE code = 'sub_unlimited_monthly' AND deleted_at IS NULL);

-- Unlimited — yearly
INSERT INTO telephony_billing_plans (
  code, name, description, plan_type, plan_category, subscription_tier,
  billing_interval, unlimited_minutes_cap_per_month,
  original_price_paise, sale_price_paise, discount_percent,
  seat_limit_admins, seat_limit_managers, seat_limit_users,
  features_html, is_contact_sales, sort_order, is_active
)
SELECT
  'sub_unlimited_yearly',
  'Unlimited — Yearly',
  'Annual unlimited calling for high-volume teams.',
  'unlimited', 'tenant_billing', 'standard',
  'year', 60000,
  1798800, 999900, 44,
  3, 10, 100,
  '<ul><li>60,000 minutes / year cap</li><li>3 admins · 10 managers · 100 users</li></ul>',
  0, 40, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM telephony_billing_plans WHERE code = 'sub_unlimited_yearly' AND deleted_at IS NULL);

-- Enterprise
INSERT INTO telephony_billing_plans (
  code, name, description, plan_type, plan_category, subscription_tier,
  billing_interval, unlimited_minutes_cap_per_month,
  seat_limit_admins, seat_limit_managers, seat_limit_users,
  features_html, is_contact_sales, sort_order, is_active
)
SELECT
  'sub_enterprise',
  'Enterprise',
  'Custom seats, rates, and SLAs for large organisations.',
  'unlimited', 'tenant_billing', 'enterprise',
  'year', 0,
  NULL, NULL, NULL,
  '<ul><li>Unlimited seats (negotiated)</li><li>Dedicated support</li><li>Custom telephony &amp; billing</li><li>Annual contract</li></ul>',
  1, 50, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM telephony_billing_plans WHERE code = 'sub_enterprise' AND deleted_at IS NULL);

-- Custom (contact / manual assignment)
INSERT INTO telephony_billing_plans (
  code, name, description, plan_type, plan_category, subscription_tier,
  billing_interval, call_rate_paise_per_minute, byo_platform_fee_paise_per_minute, call_min_balance_paise,
  features_html, is_contact_sales, sort_order, is_active
)
SELECT
  'sub_custom',
  'Custom plan',
  'Manually configured plan for special agreements.',
  'credit', 'tenant_billing', 'custom',
  'month', 100, 25, 100,
  '<p>Contact your account manager for pricing and limits.</p>',
  1, 60, 0
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM telephony_billing_plans WHERE code = 'sub_custom' AND deleted_at IS NULL);
