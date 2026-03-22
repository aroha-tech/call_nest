-- ============================================
-- Lead Integrations (provider tokens + webhook)
-- ============================================

CREATE TABLE IF NOT EXISTS lead_integrations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,

  -- Examples: meta_lead_ads, google_lead_forms, justdial, indiamart, real_estate_portal
  provider_code VARCHAR(50) NOT NULL,
  provider_account_name VARCHAR(255) NULL,

  tokens_json JSON NOT NULL,
  webhook_secret VARCHAR(255) NULL,

  -- Used for creating/updating imported leads
  default_owner_user_id BIGINT UNSIGNED NULL,
  default_country_code VARCHAR(10) NOT NULL DEFAULT '+91',

  is_active TINYINT(1) NOT NULL DEFAULT 1,
  deleted_at TIMESTAMP NULL DEFAULT NULL,

  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (default_owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL,

  UNIQUE KEY uq_lead_integrations_tenant_provider_account (tenant_id, provider_code, provider_account_name),
  INDEX idx_lead_integrations_tenant_provider (tenant_id, provider_code),
  INDEX idx_lead_integrations_deleted_at (tenant_id, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

