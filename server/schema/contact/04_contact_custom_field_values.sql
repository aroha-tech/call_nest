-- ============================================
-- Contact Custom Field Values (Per Tenant, Per Contact)
-- Stores values for tenant-defined contact custom fields.
-- ============================================

CREATE TABLE IF NOT EXISTS contact_custom_field_values (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  contact_id BIGINT UNSIGNED NOT NULL,
  field_id BIGINT UNSIGNED NOT NULL,

  value_text TEXT NULL,  -- stored as string; interpreted by type on read

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  FOREIGN KEY (field_id) REFERENCES contact_custom_fields(id) ON DELETE CASCADE,

  UNIQUE KEY uq_contact_custom_field_values (tenant_id, contact_id, field_id),
  INDEX idx_contact_custom_field_values_contact (tenant_id, contact_id),
  INDEX idx_contact_custom_field_values_field (tenant_id, field_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

