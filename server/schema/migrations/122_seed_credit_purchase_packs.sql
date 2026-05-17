-- Seed example credit purchase packs (tenant-facing Razorpay top-ups).
-- Requires migrations 119 and 120.
--
-- Paste-ready:
--   USE call_nest;
--   SOURCE server/schema/migrations/122_seed_credit_purchase_packs.sql;
--
-- Shell:
--   mysql -u root -p call_nest < server/schema/migrations/122_seed_credit_purchase_packs.sql

INSERT INTO telephony_billing_plans (
  code, name, description, plan_type, plan_category,
  billing_interval, original_price_paise, sale_price_paise, discount_percent, wallet_credit_paise,
  sort_order, is_active
)
SELECT
  'credit_pack_starter_monthly',
  'Starter pack',
  'Good for small teams getting started with outbound calling on platform Exotel.',
  'credit',
  'credit_purchase',
  'month',
  99900,
  49900,
  50,
  55000,
  10,
  1
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM telephony_billing_plans WHERE code = 'credit_pack_starter_monthly' AND deleted_at IS NULL
);

INSERT INTO telephony_billing_plans (
  code, name, description, plan_type, plan_category,
  billing_interval, original_price_paise, sale_price_paise, discount_percent, wallet_credit_paise,
  sort_order, is_active
)
SELECT
  'credit_pack_growth_monthly',
  'Growth pack',
  'More wallet credit for growing teams with regular outbound volume.',
  'credit',
  'credit_purchase',
  'month',
  149900,
  99900,
  33,
  115000,
  20,
  1
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM telephony_billing_plans WHERE code = 'credit_pack_growth_monthly' AND deleted_at IS NULL
);

INSERT INTO telephony_billing_plans (
  code, name, description, plan_type, plan_category,
  billing_interval, original_price_paise, sale_price_paise, discount_percent, wallet_credit_paise,
  sort_order, is_active
)
SELECT
  'credit_pack_annual',
  'Annual pack',
  'Best value for teams committing to a full year of calling credits.',
  'credit',
  'credit_purchase',
  'year',
  1199900,
  999900,
  17,
  1200000,
  30,
  1
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM telephony_billing_plans WHERE code = 'credit_pack_annual' AND deleted_at IS NULL
);

INSERT INTO telephony_billing_plans (
  code, name, description, plan_type, plan_category,
  billing_interval, original_price_paise, sale_price_paise, discount_percent, wallet_credit_paise,
  sort_order, is_active
)
SELECT
  'credit_pack_quick_topup',
  'Quick top-up',
  'One-time wallet boost when you need credits immediately.',
  'credit',
  'credit_purchase',
  'one_time',
  29900,
  24900,
  17,
  30000,
  40,
  1
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM telephony_billing_plans WHERE code = 'credit_pack_quick_topup' AND deleted_at IS NULL
);
