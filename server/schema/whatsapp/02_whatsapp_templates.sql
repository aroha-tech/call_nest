-- WhatsApp Business API templates (Meta-approved; template_name, provider_template_id)
-- Table name avoids conflict with templates.whatsapp_templates (message templates with is_active).
CREATE TABLE IF NOT EXISTS whatsapp_business_templates (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  whatsapp_account_id BIGINT UNSIGNED NULL,
  template_name VARCHAR(150) NOT NULL,
  provider_template_id VARCHAR(150),
  category VARCHAR(50),
  language VARCHAR(20) DEFAULT 'en',
  status ENUM('active','inactive') DEFAULT 'active',
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_whatsapp_business_templates_tenant_id (tenant_id),
  INDEX idx_whatsapp_business_templates_account_id (whatsapp_account_id),
  INDEX idx_whatsapp_business_templates_tenant_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
