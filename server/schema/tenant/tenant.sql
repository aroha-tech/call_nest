-- ============================================
-- Tenants Table (companies/organizations)
-- One tenant per client company
-- Platform tenant (id=1) is reserved for super admin
-- Soft delete: is_deleted + deleted_at; enable/disable: is_enabled
-- ============================================

CREATE TABLE IF NOT EXISTS tenants (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  industry_id CHAR(36) NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (industry_id) REFERENCES industries(id) ON DELETE SET NULL,

  INDEX idx_tenants_slug (slug),
  INDEX idx_tenants_industry (industry_id),
  INDEX idx_tenants_enabled (is_enabled),
  INDEX idx_tenants_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
