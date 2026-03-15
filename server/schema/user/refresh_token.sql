-- Refresh tokens table for JWT refresh token concept
-- Stores refresh tokens with user association and expiration
-- Soft delete: is_deleted + deleted_at

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  tenant_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE COMMENT 'Hashed refresh token (sha256 hex)',
  expires_at TIMESTAMP NOT NULL,
  is_revoked TINYINT(1) NOT NULL DEFAULT 0,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  user_agent VARCHAR(500) NULL,
  ip_address VARCHAR(45) NULL,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,

  UNIQUE KEY uk_refresh_token_hash (token_hash),
  INDEX idx_refresh_tokens_user (user_id),
  INDEX idx_refresh_tokens_expires (expires_at),
  INDEX idx_refresh_tokens_revoked (is_revoked),
  INDEX idx_refresh_tokens_deleted (is_deleted),
  INDEX idx_user_active_tokens (user_id, is_revoked)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
