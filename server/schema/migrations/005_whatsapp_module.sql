-- WhatsApp Business API Module (MVP)
-- Creates: whatsapp_accounts, whatsapp_business_templates, whatsapp_template_components, whatsapp_messages, whatsapp_api_logs
-- (whatsapp_business_templates is used so the existing whatsapp_templates table from templates domain is unchanged.)
--
-- From project root, MySQL CLI:
--   mysql -u root -p call_nest < server/schema/migrations/005_whatsapp_module.sql
-- Or inside MySQL:
--   USE call_nest;
--   SOURCE server/schema/migrations/005_whatsapp_module.sql;

-- 1. WhatsApp accounts (API credentials per tenant)
CREATE TABLE IF NOT EXISTS whatsapp_accounts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(50) DEFAULT 'meta',
  phone_number VARCHAR(20) NOT NULL,
  phone_number_id VARCHAR(150),
  business_account_id VARCHAR(150),
  access_token TEXT,
  status ENUM('active','inactive') DEFAULT 'active',
  is_deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = soft deleted',
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_whatsapp_accounts_tenant_id (tenant_id),
  INDEX idx_whatsapp_accounts_tenant_status (tenant_id, status),
  INDEX idx_whatsapp_accounts_deleted (tenant_id, is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. WhatsApp Business API templates (Meta-approved; separate from templates.whatsapp_templates)
CREATE TABLE IF NOT EXISTS whatsapp_business_templates (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  whatsapp_account_id BIGINT UNSIGNED NULL,
  template_name VARCHAR(150) NOT NULL,
  provider_template_id VARCHAR(150),
  category VARCHAR(50),
  language VARCHAR(20) DEFAULT 'en',
  status ENUM('active','inactive') DEFAULT 'active',
  is_deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = soft deleted',
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_whatsapp_business_templates_tenant_id (tenant_id),
  INDEX idx_whatsapp_business_templates_account_id (whatsapp_account_id),
  INDEX idx_whatsapp_business_templates_tenant_status (tenant_id, status),
  INDEX idx_whatsapp_business_templates_deleted (tenant_id, is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Template components (HEADER, BODY, FOOTER)
CREATE TABLE IF NOT EXISTS whatsapp_template_components (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  template_id BIGINT UNSIGNED NOT NULL,
  component_type ENUM('HEADER','BODY','FOOTER') NOT NULL,
  component_text TEXT,
  component_order INT DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_whatsapp_template_components_template_id (template_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Message log
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  whatsapp_account_id BIGINT UNSIGNED NULL,
  contact_id BIGINT UNSIGNED NULL,
  phone VARCHAR(20),
  template_id BIGINT UNSIGNED NULL,
  message_text TEXT,
  provider_message_id VARCHAR(150),
  status ENUM('pending','sent','delivered','read','failed') DEFAULT 'pending',
  sent_at TIMESTAMP NULL,
  delivered_at TIMESTAMP NULL,
  read_at TIMESTAMP NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_whatsapp_messages_tenant_id (tenant_id),
  INDEX idx_whatsapp_messages_contact_id (contact_id),
  INDEX idx_whatsapp_messages_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. API request/response logs
CREATE TABLE IF NOT EXISTS whatsapp_api_logs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  whatsapp_account_id BIGINT UNSIGNED NULL,
  direction ENUM('outbound','inbound') DEFAULT 'outbound',
  endpoint VARCHAR(255),
  method VARCHAR(20),
  request_body JSON,
  response_status INT,
  response_body JSON,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_whatsapp_api_logs_tenant_id (tenant_id),
  INDEX idx_whatsapp_api_logs_account_id (whatsapp_account_id),
  INDEX idx_whatsapp_api_logs_created_at (tenant_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
