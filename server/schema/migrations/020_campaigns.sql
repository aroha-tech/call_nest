-- ============================================
-- Migration 020: campaigns table
-- Run if API returns ER_NO_SUCH_TABLE for `campaigns`.
-- Includes full audit columns (created_by, updated_by, deleted_at, deleted_by).
-- ============================================

CREATE TABLE IF NOT EXISTS campaigns (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,

  name VARCHAR(255) NOT NULL,

  type ENUM('static','filter') NOT NULL DEFAULT 'static',

  manager_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,

  filters_json JSON NULL,

  status ENUM('active','paused') NOT NULL DEFAULT 'active',

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  deleted_by BIGINT UNSIGNED NULL,

  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL,

  INDEX idx_campaigns_tenant (tenant_id, id),
  INDEX idx_campaigns_manager (tenant_id, manager_id),
  INDEX idx_campaigns_status (tenant_id, status),
  INDEX idx_campaigns_deleted_at (tenant_id, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
