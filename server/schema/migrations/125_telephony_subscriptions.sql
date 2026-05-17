-- Telephony subscription periods, checkout orders, and idempotent included-wallet grants.
--
-- Paste-ready (SQL editor):
--   USE call_nest;
--   SOURCE server/schema/migrations/125_telephony_subscriptions.sql;
--
-- File-based run from project root:
--   mysql -u root -p call_nest < server/schema/migrations/125_telephony_subscriptions.sql

ALTER TABLE telephony_billing_plans
  ADD COLUMN razorpay_plan_id VARCHAR(64) NULL
    COMMENT 'Cached Razorpay Plan id for recurring (autopay) checkout.'
    AFTER sale_price_paise;

CREATE TABLE IF NOT EXISTS tenant_telephony_subscriptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  telephony_billing_plan_id BIGINT UNSIGNED NOT NULL,
  status ENUM('pending', 'active', 'cancelled', 'expired') NOT NULL DEFAULT 'pending',
  current_period_start DATETIME NOT NULL,
  current_period_end DATETIME NOT NULL,
  auto_renew TINYINT(1) NOT NULL DEFAULT 0,
  razorpay_order_id VARCHAR(64) NULL,
  razorpay_payment_id VARCHAR(64) NULL,
  razorpay_subscription_id VARCHAR(64) NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_tts_tenant_status (tenant_id, status, deleted_at),
  KEY idx_tts_period_end (tenant_id, current_period_end, deleted_at),
  KEY idx_tts_rzp_sub (razorpay_subscription_id),
  KEY idx_tts_deleted (tenant_id, deleted_at),
  CONSTRAINT fk_tts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_tts_plan FOREIGN KEY (telephony_billing_plan_id) REFERENCES telephony_billing_plans(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tts_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tts_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tts_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tenant_telephony_subscription_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  telephony_billing_plan_id BIGINT UNSIGNED NOT NULL,
  razorpay_order_id VARCHAR(64) NULL,
  razorpay_subscription_id VARCHAR(64) NULL,
  amount_paise BIGINT UNSIGNED NOT NULL DEFAULT 0,
  auto_renew TINYINT(1) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  status ENUM('pending', 'completed', 'expired') NOT NULL DEFAULT 'pending',
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ttso_rzp_order (razorpay_order_id),
  UNIQUE KEY uq_ttso_rzp_sub (razorpay_subscription_id),
  KEY idx_ttso_tenant_status (tenant_id, status, deleted_at),
  KEY idx_ttso_deleted (tenant_id, deleted_at),
  CONSTRAINT fk_ttso_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_ttso_plan FOREIGN KEY (telephony_billing_plan_id) REFERENCES telephony_billing_plans(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ttso_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_ttso_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_ttso_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tenant_telephony_wallet_grants (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  telephony_billing_plan_id BIGINT UNSIGNED NOT NULL,
  grant_source ENUM('admin_assign', 'subscription_start', 'subscription_renewal') NOT NULL,
  grant_reference VARCHAR(191) NOT NULL,
  amount_paise BIGINT UNSIGNED NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ttwg_reference (tenant_id, grant_reference),
  KEY idx_ttwg_tenant (tenant_id, created_at),
  CONSTRAINT fk_ttwg_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_ttwg_plan FOREIGN KEY (telephony_billing_plan_id) REFERENCES telephony_billing_plans(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ttwg_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill active subscription rows for tenants that already have a telephony plan assigned.
INSERT INTO tenant_telephony_subscriptions (
  tenant_id, telephony_billing_plan_id, status,
  current_period_start, current_period_end, auto_renew, created_at, updated_at
)
SELECT
  t.id,
  t.telephony_billing_plan_id,
  'active',
  UTC_TIMESTAMP(),
  CASE
    WHEN COALESCE(p.subscription_tier, 'standard') = 'free' THEN DATE_ADD(UTC_TIMESTAMP(), INTERVAL COALESCE(p.trial_duration_days, 14) DAY)
    WHEN p.billing_interval = 'year' THEN DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 YEAR)
    ELSE DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 MONTH)
  END,
  0,
  UTC_TIMESTAMP(),
  UTC_TIMESTAMP()
FROM tenants t
JOIN telephony_billing_plans p ON p.id = t.telephony_billing_plan_id AND p.deleted_at IS NULL
WHERE t.is_deleted = 0
  AND t.telephony_billing_plan_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM tenant_telephony_subscriptions ts
    WHERE ts.tenant_id = t.id AND ts.deleted_at IS NULL AND ts.status = 'active'
  );
