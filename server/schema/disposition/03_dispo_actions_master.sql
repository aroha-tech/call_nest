-- ============================================
-- Disposition Actions Master Table (GLOBAL)
-- Platform-wide action definitions
-- Super admin manages these; defines actions like 'schedule_callback', 'send_email', etc.
-- Max 3 actions per disposition enforced at service layer (NOT DB level)
-- ============================================

CREATE TABLE IF NOT EXISTS dispo_actions_master (
  id CHAR(36) PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,

  INDEX idx_dispo_actions_master_code (code),
  INDEX idx_dispo_actions_master_active (is_active),
  INDEX idx_dispo_actions_master_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
