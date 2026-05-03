-- Billing: demo subscription plans, Razorpay checkout orders, payments, subscription history (tenant-scoped).
-- Paste-ready SQL for SQL editors:
--   USE call_nest;
--   SOURCE server/schema/migrations/089_billing_razorpay.sql;
--
-- File-based run from project root:
--   mysql -u root -p call_nest < server/schema/migrations/089_billing_razorpay.sql
--   (or in mysql client after USE call_nest;)
--   source server/schema/migrations/089_billing_razorpay.sql;

CREATE TABLE IF NOT EXISTS subscription_plans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NULL COMMENT 'NULL = platform-wide demo plan',
  code VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  description TEXT NULL,
  amount_paise BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  billing_interval ENUM('month', 'year') NOT NULL DEFAULT 'month',
  interval_count INT UNSIGNED NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_subscription_plans_scope_active (tenant_id, is_active, deleted_at),
  KEY idx_subscription_plans_deleted (tenant_id, deleted_at),
  UNIQUE KEY uq_subscription_plans_code (code),
  CONSTRAINT fk_subscription_plans_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tenant_billing_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  plan_id BIGINT UNSIGNED NOT NULL,
  razorpay_order_id VARCHAR(64) NOT NULL,
  amount_paise BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  status ENUM('pending', 'completed', 'expired') NOT NULL DEFAULT 'pending',
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenant_billing_orders_rzp (razorpay_order_id),
  KEY idx_tenant_billing_orders_tenant_status (tenant_id, status, deleted_at),
  KEY idx_tenant_billing_orders_deleted (tenant_id, deleted_at),
  CONSTRAINT fk_tenant_billing_orders_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_tenant_billing_orders_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tenant_billing_orders_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tenant_billing_orders_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tenant_billing_orders_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  plan_id BIGINT UNSIGNED NOT NULL,
  status ENUM('pending', 'active', 'cancelled', 'expired') NOT NULL DEFAULT 'pending',
  current_period_start DATETIME NOT NULL,
  current_period_end DATETIME NOT NULL,
  razorpay_order_id VARCHAR(64) NULL,
  razorpay_payment_id VARCHAR(64) NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_tenant_subscriptions_tenant_status (tenant_id, status, deleted_at),
  KEY idx_tenant_subscriptions_period (tenant_id, current_period_end, deleted_at),
  KEY idx_tenant_subscriptions_deleted (tenant_id, deleted_at),
  CONSTRAINT fk_tenant_subscriptions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_tenant_subscriptions_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tenant_subscriptions_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tenant_subscriptions_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tenant_subscriptions_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tenant_payment_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  subscription_id BIGINT UNSIGNED NULL,
  plan_id BIGINT UNSIGNED NULL,
  razorpay_order_id VARCHAR(64) NOT NULL,
  razorpay_payment_id VARCHAR(64) NOT NULL,
  amount_paise BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  status ENUM('created', 'authorized', 'captured', 'failed', 'refunded') NOT NULL DEFAULT 'captured',
  payment_method VARCHAR(64) NULL,
  raw_payload_json JSON NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenant_payment_rzp_payment (razorpay_payment_id),
  KEY idx_tenant_payment_tenant_created (tenant_id, created_at, deleted_at),
  KEY idx_tenant_payment_order (tenant_id, razorpay_order_id, deleted_at),
  KEY idx_tenant_payment_deleted (tenant_id, deleted_at),
  CONSTRAINT fk_tenant_payment_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_tenant_payment_subscription FOREIGN KEY (subscription_id) REFERENCES tenant_subscriptions(id) ON DELETE SET NULL,
  CONSTRAINT fk_tenant_payment_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE SET NULL,
  CONSTRAINT fk_tenant_payment_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tenant_payment_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tenant_payment_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Demo plans (platform-wide: tenant_id IS NULL). Amounts in paise (INR).
INSERT INTO subscription_plans (
  tenant_id, code, name, description, amount_paise, currency, billing_interval, interval_count, is_active, sort_order
)
SELECT NULL, 'demo_starter', 'Demo Starter',
  'Up to 5 users, core CRM and dialer. Demo pricing for evaluation.',
  49900, 'INR', 'month', 1, 1, 10
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans sp WHERE sp.code = 'demo_starter' AND sp.deleted_at IS NULL);

INSERT INTO subscription_plans (
  tenant_id, code, name, description, amount_paise, currency, billing_interval, interval_count, is_active, sort_order
)
SELECT NULL, 'demo_growth', 'Demo Growth',
  'Up to 25 users, reports, WhatsApp and email modules. Demo pricing.',
  99900, 'INR', 'month', 1, 1, 20
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans sp WHERE sp.code = 'demo_growth' AND sp.deleted_at IS NULL);

INSERT INTO subscription_plans (
  tenant_id, code, name, description, amount_paise, currency, billing_interval, interval_count, is_active, sort_order
)
SELECT NULL, 'demo_enterprise_yearly', 'Demo Enterprise (Yearly)',
  'Unlimited users, priority support, annual billing. Demo pricing.',
  999900, 'INR', 'year', 1, 1, 30
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans sp WHERE sp.code = 'demo_enterprise_yearly' AND sp.deleted_at IS NULL);
