-- Users: super_admin (platform admin), admin (per tenant), manager (per tenant), agent (per tenant)
-- Platform admins do NOT belong to a specific tenant (tenant_id NULL, is_platform_admin = 1).
-- Tenant users MUST belong to a tenant (tenant_id NOT NULL, is_platform_admin = 0).
-- Soft delete: is_deleted (boolean) + deleted_at (timestamp); enable/disable: is_enabled

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('super_admin', 'admin', 'manager', 'agent') NULL,
  manager_id BIGINT UNSIGNED NULL,
  name VARCHAR(255) NULL,
  is_platform_admin TINYINT(1) NOT NULL DEFAULT 0,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  failed_login_attempts INT NOT NULL DEFAULT 0,
  account_locked_until TIMESTAMP NULL,
  password_changed_at TIMESTAMP NULL,
  last_login_at TIMESTAMP NULL,
  datetime_display_mode ENUM('ist_fixed', 'browser_local') NOT NULL DEFAULT 'ist_fixed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,

  CONSTRAINT chk_users_platform_admin_tenant
    CHECK (
      (is_platform_admin = 1 AND tenant_id IS NULL)
      OR
      (is_platform_admin = 0 AND tenant_id IS NOT NULL)
    ),

  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
  FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL,

  UNIQUE KEY uk_user_email_per_tenant (tenant_id, email),
  UNIQUE KEY uk_platform_admin_email (email, is_platform_admin),

  INDEX idx_users_tenant (tenant_id),
  INDEX idx_users_tenant_id_id (tenant_id, id),
  INDEX idx_users_manager_id (manager_id),
  INDEX idx_users_email (email),
  INDEX idx_users_deleted (is_deleted),
  INDEX idx_users_deleted_at (deleted_at),
  INDEX idx_users_enabled (is_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
