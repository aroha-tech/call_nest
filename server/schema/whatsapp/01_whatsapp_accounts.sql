-- WhatsApp Business API accounts per tenant (provider-agnostic)
-- provider: meta | twilio | gupshup | interakt | kaleyra
-- Credentials stored in external_account_id, api_key, api_secret
CREATE TABLE IF NOT EXISTS whatsapp_accounts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(50) DEFAULT 'meta',
  account_name VARCHAR(100) NULL,
  phone_number VARCHAR(20) NOT NULL,
  external_account_id VARCHAR(150) NULL,
  api_key TEXT NULL,
  api_secret TEXT NULL,
  webhook_url VARCHAR(255) NULL,
  status ENUM('active','inactive') DEFAULT 'active',
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_whatsapp_accounts_tenant_id (tenant_id),
  INDEX idx_whatsapp_accounts_tenant_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
