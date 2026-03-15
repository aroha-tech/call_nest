-- ============================================
-- Call Scripts (TENANT LEVEL)
-- Guided conversation scripts for agents during calls
-- Supports {{variable_key}} and {{variable_key | fallback}} from template_variables
-- ============================================

CREATE TABLE IF NOT EXISTS call_scripts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  script_name VARCHAR(255) NOT NULL,
  script_body TEXT NOT NULL,
  variables_used JSON NULL COMMENT 'Array of variable keys detected in script_body',
  status TINYINT(1) NOT NULL DEFAULT 1,
  is_default TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'One script per tenant is default; first created if none',
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at TIMESTAMP NULL DEFAULT NULL,

  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,

  INDEX idx_call_scripts_tenant (tenant_id),
  INDEX idx_call_scripts_tenant_deleted (tenant_id, is_deleted),
  INDEX idx_call_scripts_status (tenant_id, status, is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
