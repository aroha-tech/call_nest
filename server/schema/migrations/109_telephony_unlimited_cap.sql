-- ============================================
-- Telephony: add an optional monthly minute cap for unlimited-mode tenants.
--
-- Why:
--   Sales asked for "unlimited calling with a cap" — the wallet stays untouched
--   (per the 'unlimited' billing mode), but super-admin can enforce a soft
--   ceiling on connected minutes per calendar month. cap = 0 (default) means
--   genuinely uncapped.
-- ============================================

ALTER TABLE tenants
  ADD COLUMN unlimited_minutes_cap_per_month_override INT UNSIGNED NULL
    COMMENT 'Per-tenant override of monthly cap for unlimited-mode tenants. NULL = use platform default. 0 = no cap.'
    AFTER call_min_balance_paise_override;

INSERT INTO platform_settings (setting_key, setting_value)
SELECT 'telephony.default_unlimited_minutes_cap_per_month', JSON_OBJECT('value', 0)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM platform_settings WHERE setting_key = 'telephony.default_unlimited_minutes_cap_per_month'
);
