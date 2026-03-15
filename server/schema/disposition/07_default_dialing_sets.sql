-- Default Dialing Sets (GLOBAL) — platform-wide default dialing set templates per industry
-- Super admin manages these; groups dispositions for specific dialing scenarios
-- is_default marks the primary dialing set for an industry

CREATE TABLE IF NOT EXISTS default_dialing_sets (
  id CHAR(36) PRIMARY KEY,
  industry_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (industry_id) REFERENCES industries(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,

  INDEX idx_default_dialing_sets_industry (industry_id),
  INDEX idx_default_dialing_sets_default (is_default),
  INDEX idx_default_dialing_sets_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
