-- Dispositions (TENANT LEVEL) — tenant-specific disposition configurations
-- Each tenant has their own dispositions; can be created from default templates
-- Links to global master tables for type, status, and temperature
-- is_connected: indicates if agent talked with customer (call was connected)
-- Soft delete: is_deleted + deleted_at

CREATE TABLE IF NOT EXISTS dispositions (
  id CHAR(36) PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  dispo_type_id CHAR(36) NOT NULL,
  contact_status_id CHAR(36) NULL,
  contact_temperature_id CHAR(36) NULL,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL,
  next_action VARCHAR(255) NULL,
  is_connected TINYINT(1) NOT NULL DEFAULT 0,
  created_from_default_id CHAR(36) NULL,
  -- Actions stored as JSON array: [{\"action_id\": \"uuid\", \"email_template_id\": \"uuid|null\", \"whatsapp_template_id\": \"uuid|null\"}, ...]
  actions JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  -- Marks records auto-created from default templates (super admin)
  is_system_generated TINYINT(1) NOT NULL DEFAULT 0,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (dispo_type_id) REFERENCES dispo_types_master(id) ON DELETE RESTRICT,
  FOREIGN KEY (contact_status_id) REFERENCES contact_status_master(id) ON DELETE RESTRICT,
  FOREIGN KEY (contact_temperature_id) REFERENCES contact_temperature_master(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_from_default_id) REFERENCES default_dispositions(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,

  UNIQUE KEY uk_dispositions_tenant_code (tenant_id, code),

  INDEX idx_dispositions_tenant (tenant_id),
  INDEX idx_dispositions_tenant_id (tenant_id, id),
  INDEX idx_dispositions_dispo_type (dispo_type_id),
  INDEX idx_dispositions_contact_status (contact_status_id),
  INDEX idx_dispositions_contact_temperature (contact_temperature_id),
  INDEX idx_dispositions_active (tenant_id, is_active),
  INDEX idx_dispositions_deleted (tenant_id, is_deleted),
  INDEX idx_dispositions_deleted_at (deleted_at),
  INDEX idx_dispositions_connected (tenant_id, is_connected)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
