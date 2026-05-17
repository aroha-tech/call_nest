-- Super-admin support impersonation (separate from user refresh_tokens; does not kick user sessions).

CREATE TABLE IF NOT EXISTS impersonation_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  impersonator_user_id BIGINT UNSIGNED NOT NULL,
  target_user_id BIGINT UNSIGNED NOT NULL,
  tenant_id BIGINT UNSIGNED NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  ended_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_impersonation_token_hash (token_hash),
  KEY idx_impersonation_target_active (target_user_id, ended_at),
  KEY idx_impersonation_impersonator (impersonator_user_id, ended_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS impersonation_exchange_codes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  payload_json JSON NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_impersonation_exchange_code (code),
  KEY idx_impersonation_exchange_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
