-- Tenant seat entitlements (purchased add-ons) + super-admin overrides + checkout orders.
--
-- Paste-ready:
--   USE call_nest;
--   SOURCE server/schema/migrations/133_tenant_seat_entitlements.sql;

ALTER TABLE tenants
  ADD COLUMN seat_limit_admins_override INT UNSIGNED NULL
    COMMENT 'Super-admin total cap for admins (NULL = plan bundle + purchased).'
    AFTER unlimited_minutes_cap_per_month_override,
  ADD COLUMN seat_limit_managers_override INT UNSIGNED NULL
    COMMENT 'Super-admin total cap for managers.'
    AFTER seat_limit_admins_override,
  ADD COLUMN seat_limit_agents_override INT UNSIGNED NULL
    COMMENT 'Super-admin total cap for agents (dialer users).'
    AFTER seat_limit_managers_override,
  ADD COLUMN seat_limit_channels_override INT UNSIGNED NULL
    COMMENT 'Super-admin total cap for unlimited-calling channels.'
    AFTER seat_limit_agents_override;

CREATE TABLE IF NOT EXISTS tenant_seat_entitlements (
  tenant_id BIGINT UNSIGNED NOT NULL,
  purchased_admins INT UNSIGNED NOT NULL DEFAULT 0,
  purchased_managers INT UNSIGNED NOT NULL DEFAULT 0,
  purchased_agents INT UNSIGNED NOT NULL DEFAULT 0,
  purchased_channels INT UNSIGNED NOT NULL DEFAULT 0,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id),
  CONSTRAINT fk_tenant_seat_entitlements_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_tenant_seat_entitlements_updated_by
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tenant_seat_purchase_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  telephony_billing_plan_id BIGINT UNSIGNED NOT NULL,
  seat_role ENUM('admin', 'manager', 'agent') NOT NULL,
  includes_unlimited_channels TINYINT(1) NOT NULL DEFAULT 0,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  razorpay_order_id VARCHAR(64) NOT NULL,
  amount_paise BIGINT UNSIGNED NOT NULL,
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
  UNIQUE KEY uq_tenant_seat_purchase_orders_rzp (razorpay_order_id),
  KEY idx_tenant_seat_purchase_orders_tenant_status (tenant_id, status, deleted_at),
  CONSTRAINT fk_tspo_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_tspo_plan FOREIGN KEY (telephony_billing_plan_id) REFERENCES telephony_billing_plans(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tspo_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tspo_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
