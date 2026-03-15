-- ============================================
-- Contact Temperature Master Table (GLOBAL)
-- Platform-wide contact temperature definitions
-- Super admin manages these; defines temperatures like 'hot', 'warm', 'cold', etc.
-- priority_order determines display/sorting order (lower = higher priority)
-- ============================================

CREATE TABLE IF NOT EXISTS contact_temperature_master (
  id CHAR(36) PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  priority_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,

  INDEX idx_contact_temperature_master_code (code),
  INDEX idx_contact_temperature_master_active (is_active),
  INDEX idx_contact_temperature_master_deleted (is_deleted),
  INDEX idx_contact_temperature_master_priority (priority_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
