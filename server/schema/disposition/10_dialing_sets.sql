-- Dialing Sets (TENANT LEVEL) — tenant-specific dialing set configurations
-- Each tenant has their own dialing sets; can be created from default templates
-- is_system_generated = 1: auto-created from default templates during tenant setup
-- Only one is_default = TRUE per tenant (enforced at service layer)
-- Soft delete: is_deleted + deleted_at

CREATE TABLE IF NOT EXISTS dialing_sets (
  id CHAR(36) PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_system_generated TINYINT(1) NOT NULL DEFAULT 0,
  created_from_default_id CHAR(36) NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (created_from_default_id) REFERENCES default_dialing_sets(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,

  INDEX idx_dialing_sets_tenant (tenant_id),
  INDEX idx_dialing_sets_tenant_id (tenant_id, id),
  INDEX idx_dialing_sets_default (tenant_id, is_default),
  INDEX idx_dialing_sets_active (tenant_id, is_active),
  INDEX idx_dialing_sets_deleted (tenant_id, is_deleted),
  INDEX idx_dialing_sets_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
