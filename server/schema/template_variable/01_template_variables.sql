-- ============================================
-- Template Variables (SYSTEM-LEVEL)
-- Used by Call Scripts, WhatsApp, Email, SMS templates
-- Variables are global; templates/scripts are tenant-owned
-- Syntax: {{variable_key}} or {{variable_key | fallback_value}}
-- ============================================

CREATE TABLE IF NOT EXISTS template_variables (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  variable_key VARCHAR(100) NOT NULL,
  variable_label VARCHAR(255) NOT NULL,
  module VARCHAR(50) NOT NULL COMMENT 'contact, agent, company, system',
  source_table VARCHAR(100) NULL COMMENT 'e.g. contacts, users, tenants',
  source_column VARCHAR(100) NULL COMMENT 'e.g. first_name, email',
  fallback_value VARCHAR(255) NULL,
  sample_value VARCHAR(500) NULL COMMENT 'Sample value for preview',
  description TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uk_template_variables_key (variable_key),
  INDEX idx_template_variables_module (module),
  INDEX idx_template_variables_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
