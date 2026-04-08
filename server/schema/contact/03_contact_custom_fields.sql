-- ============================================
-- Contact Custom Fields (Definitions, Per Tenant)
-- Each tenant can define its own additional fields for contacts.
-- ============================================

CREATE TABLE IF NOT EXISTS contact_custom_fields (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,

  name VARCHAR(100) NOT NULL,  -- internal key, e.g. 'property_type'
  label VARCHAR(255) NOT NULL, -- display label
  type ENUM('text','number','date','boolean','select','multiselect','multiselect_dropdown') NOT NULL,
  options_json JSON NULL,      -- for select: list of options

  is_required TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,

  UNIQUE KEY uq_contact_custom_fields_name (tenant_id, name),
  INDEX idx_contact_custom_fields_tenant (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

