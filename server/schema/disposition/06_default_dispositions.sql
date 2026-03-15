-- Default Dispositions (GLOBAL) — platform-wide default disposition templates per industry
-- Super admin manages these; provides industry-specific disposition templates
-- Tenants can copy these as starting point for their own dispositions
-- is_connected: indicates if agent talked with customer (call was connected)

CREATE TABLE IF NOT EXISTS default_dispositions (
  id CHAR(36) PRIMARY KEY,
  industry_id CHAR(36) NULL,
  dispo_type_id CHAR(36) NOT NULL,
  contact_status_id CHAR(36) NULL,
  contact_temperature_id CHAR(36) NULL,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL,
  next_action VARCHAR(255) NULL,
  is_connected TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (industry_id) REFERENCES industries(id) ON DELETE RESTRICT,
  FOREIGN KEY (dispo_type_id) REFERENCES dispo_types_master(id) ON DELETE RESTRICT,
  FOREIGN KEY (contact_status_id) REFERENCES contact_status_master(id) ON DELETE RESTRICT,
  FOREIGN KEY (contact_temperature_id) REFERENCES contact_temperature_master(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,

  UNIQUE KEY uk_default_dispositions_industry_code (industry_id, code),

  INDEX idx_default_dispositions_industry (industry_id),
  INDEX idx_default_dispositions_dispo_type (dispo_type_id),
  INDEX idx_default_dispositions_contact_status (contact_status_id),
  INDEX idx_default_dispositions_contact_temperature (contact_temperature_id),
  INDEX idx_default_dispositions_active (is_active),
  INDEX idx_default_dispositions_connected (is_connected)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
