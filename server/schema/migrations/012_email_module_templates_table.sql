-- Email module uses its own template table to avoid conflict with existing email_templates (disposition/templates domain).
-- Run after 011. From project root: mysql -u root -p call_nest < server/schema/migrations/012_email_module_templates_table.sql
-- Or in MySQL: USE call_nest; SOURCE d:/own_software/call_nest/server/schema/migrations/012_email_module_templates_table.sql;

CREATE TABLE IF NOT EXISTS email_module_templates (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  body_html LONGTEXT NULL,
  body_text TEXT NULL,
  status ENUM('active','inactive') DEFAULT 'active',
  is_deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = soft deleted',
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email_module_templates_tenant_id (tenant_id),
  INDEX idx_email_module_templates_tenant_status (tenant_id, status),
  INDEX idx_email_module_templates_deleted (tenant_id, is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
