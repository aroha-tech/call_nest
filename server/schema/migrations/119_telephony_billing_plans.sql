-- Telephony billing plans catalog (platform-wide templates for credit & unlimited modes).
--
-- Paste-ready (SQL editor):
--   USE call_nest;
--   SOURCE server/schema/migrations/119_telephony_billing_plans.sql;
--
-- File-based run from project root:
--   mysql -u root -p call_nest < server/schema/migrations/119_telephony_billing_plans.sql

CREATE TABLE IF NOT EXISTS telephony_billing_plans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  description TEXT NULL,
  plan_type ENUM('credit', 'unlimited') NOT NULL
    COMMENT 'credit = pay-per-minute wallet; unlimited = subscription-style usage cap',
  call_rate_paise_per_minute INT UNSIGNED NULL
    COMMENT 'Default-account rate (credit plans). NULL when plan_type = unlimited.',
  byo_platform_fee_paise_per_minute INT UNSIGNED NULL
    COMMENT 'BYO platform fee per minute (credit plans).',
  call_min_balance_paise INT UNSIGNED NULL
    COMMENT 'Minimum wallet balance to start a call (credit plans).',
  unlimited_minutes_cap_per_month INT UNSIGNED NULL
    COMMENT 'Monthly connected-minute cap (unlimited plans). 0 = no cap.',
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_telephony_billing_plans_code (code),
  KEY idx_telephony_billing_plans_active (is_active, deleted_at),
  KEY idx_telephony_billing_plans_type (plan_type, is_active, deleted_at),
  KEY idx_telephony_billing_plans_deleted (deleted_at),
  CONSTRAINT fk_tbp_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tbp_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tbp_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 2a: add column (run before FK). If AFTER fails, run 119b_telephony_billing_plans_tenants_column.sql instead.
ALTER TABLE tenants
  ADD COLUMN telephony_billing_plan_id BIGINT UNSIGNED NULL
    COMMENT 'Assigned telephony billing plan template. NULL = manual overrides only.'
    AFTER call_min_balance_paise_override;

-- Step 2b: add FK in a separate ALTER (avoids "Key column doesn't exist" in some SQL clients)
ALTER TABLE tenants
  ADD CONSTRAINT fk_tenants_telephony_billing_plan
    FOREIGN KEY (telephony_billing_plan_id) REFERENCES telephony_billing_plans(id)
    ON DELETE SET NULL;

-- Starter templates (safe to re-run: codes are unique).
INSERT INTO telephony_billing_plans (
  code, name, description, plan_type,
  call_rate_paise_per_minute, byo_platform_fee_paise_per_minute, call_min_balance_paise,
  unlimited_minutes_cap_per_month, sort_order, is_active
)
SELECT
  'credit_standard',
  'Credit — Standard',
  'Pay per connected minute from the call credit wallet. Uses platform default rates unless overridden on the plan.',
  'credit',
  100, 25, 100,
  NULL,
  10,
  1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM telephony_billing_plans WHERE code = 'credit_standard' AND deleted_at IS NULL);

INSERT INTO telephony_billing_plans (
  code, name, description, plan_type,
  call_rate_paise_per_minute, byo_platform_fee_paise_per_minute, call_min_balance_paise,
  unlimited_minutes_cap_per_month, sort_order, is_active
)
SELECT
  'credit_starter',
  'Credit — Starter (low min balance)',
  'Lower minimum wallet balance for small teams starting outbound calling.',
  'credit',
  60, 25, 50,
  NULL,
  20,
  1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM telephony_billing_plans WHERE code = 'credit_starter' AND deleted_at IS NULL);

INSERT INTO telephony_billing_plans (
  code, name, description, plan_type,
  call_rate_paise_per_minute, byo_platform_fee_paise_per_minute, call_min_balance_paise,
  unlimited_minutes_cap_per_month, sort_order, is_active
)
SELECT
  'unlimited_5k',
  'Unlimited — 5,000 min / month',
  'No per-call wallet debit. Usage is tracked; new calls blocked after 5,000 connected minutes per calendar month.',
  'unlimited',
  NULL, NULL, NULL,
  5000,
  30,
  1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM telephony_billing_plans WHERE code = 'unlimited_5k' AND deleted_at IS NULL);

INSERT INTO telephony_billing_plans (
  code, name, description, plan_type,
  call_rate_paise_per_minute, byo_platform_fee_paise_per_minute, call_min_balance_paise,
  unlimited_minutes_cap_per_month, sort_order, is_active
)
SELECT
  'unlimited_uncapped',
  'Unlimited — No monthly cap',
  'Unlimited connected minutes with usage tracking only (no monthly cap).',
  'unlimited',
  NULL, NULL, NULL,
  0,
  40,
  1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM telephony_billing_plans WHERE code = 'unlimited_uncapped' AND deleted_at IS NULL);
