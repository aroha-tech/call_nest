-- Credit pack checkout orders + deactivate demo subscription plans.
--
-- Paste-ready:
--   USE call_nest;
--   SOURCE server/schema/migrations/121_credit_purchase_orders_deactivate_demo.sql;
--
-- Shell:
--   mysql -u root -p call_nest < server/schema/migrations/121_credit_purchase_orders_deactivate_demo.sql

CREATE TABLE IF NOT EXISTS tenant_credit_purchase_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  telephony_billing_plan_id BIGINT UNSIGNED NOT NULL,
  razorpay_order_id VARCHAR(64) NOT NULL,
  amount_paise BIGINT UNSIGNED NOT NULL,
  wallet_credit_paise BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  status ENUM('pending', 'completed', 'expired') NOT NULL DEFAULT 'pending',
  razorpay_payment_id VARCHAR(64) NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenant_credit_purchase_orders_rzp (razorpay_order_id),
  KEY idx_tenant_credit_purchase_orders_tenant_status (tenant_id, status, deleted_at),
  KEY idx_tenant_credit_purchase_orders_deleted (tenant_id, deleted_at),
  CONSTRAINT fk_tcpo_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_tcpo_plan FOREIGN KEY (telephony_billing_plan_id) REFERENCES telephony_billing_plans(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tcpo_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tcpo_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tcpo_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE subscription_plans
SET is_active = 0, updated_at = UTC_TIMESTAMP()
WHERE deleted_at IS NULL AND code IN ('demo_starter', 'demo_growth', 'demo_enterprise_yearly');
