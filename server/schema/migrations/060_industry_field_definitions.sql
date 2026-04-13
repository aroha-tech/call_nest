-- Industry-specific contact/lead fields (platform catalog per industry).
-- Values stored on contacts.industry_profile (JSON).
-- Run: mysql -u root -p call_nest < server/schema/migrations/060_industry_field_definitions.sql

CREATE TABLE IF NOT EXISTS industry_field_definitions (
  id CHAR(36) PRIMARY KEY,
  industry_id CHAR(36) NOT NULL,
  field_key VARCHAR(100) NOT NULL,
  label VARCHAR(255) NOT NULL,
  type ENUM('text','number','date','boolean','select','multiselect','multiselect_dropdown') NOT NULL,
  options_json JSON NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_required TINYINT(1) NOT NULL DEFAULT 0,
  is_optional TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'If 1, tenant must opt-in via tenant_industry_field_settings',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_industry_field_key (industry_id, field_key),
  KEY idx_ifd_industry (industry_id, sort_order, id),
  CONSTRAINT fk_ifd_industry FOREIGN KEY (industry_id) REFERENCES industries(id) ON DELETE CASCADE,
  CONSTRAINT fk_ifd_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_ifd_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tenant_industry_field_settings (
  tenant_id BIGINT UNSIGNED NOT NULL,
  field_definition_id CHAR(36) NOT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, field_definition_id),
  KEY idx_tifs_field (field_definition_id),
  CONSTRAINT fk_tifs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_tifs_field FOREIGN KEY (field_definition_id) REFERENCES industry_field_definitions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE contacts
  ADD COLUMN industry_profile JSON NULL COMMENT 'Industry-specific field values (object keyed by field_key)' AFTER tax_id;
