-- Dialer sessions (call queue) + items. Separate from call history.
-- Run: mysql -u root -p call_nest < server/schema/migrations/048_dialer_sessions.sql

CREATE TABLE IF NOT EXISTS dialer_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  created_by_user_id BIGINT UNSIGNED NULL,

  provider VARCHAR(32) NOT NULL DEFAULT 'dummy',
  status ENUM('active','completed','cancelled') NOT NULL DEFAULT 'active',
  started_at TIMESTAMP NULL DEFAULT NULL,
  ended_at TIMESTAMP NULL DEFAULT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_ds_tenant_created (tenant_id, created_at),
  KEY idx_ds_tenant_status (tenant_id, status),
  CONSTRAINT fk_ds_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_ds_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dialer_session_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  session_id BIGINT UNSIGNED NOT NULL,
  contact_id BIGINT UNSIGNED NOT NULL,
  contact_phone_id BIGINT UNSIGNED NULL,

  order_index INT UNSIGNED NOT NULL DEFAULT 0,
  state ENUM('queued','calling','called','skipped','failed') NOT NULL DEFAULT 'queued',
  last_attempt_id BIGINT UNSIGNED NULL,
  last_error VARCHAR(255) NULL,
  called_at TIMESTAMP NULL DEFAULT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_dsi_session_contact (tenant_id, session_id, contact_id),
  KEY idx_dsi_tenant_session_order (tenant_id, session_id, order_index),
  KEY idx_dsi_tenant_session_state (tenant_id, session_id, state),

  CONSTRAINT fk_dsi_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_dsi_session FOREIGN KEY (session_id) REFERENCES dialer_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_dsi_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  CONSTRAINT fk_dsi_phone FOREIGN KEY (contact_phone_id) REFERENCES contact_phones(id) ON DELETE SET NULL,
  CONSTRAINT fk_dsi_attempt FOREIGN KEY (last_attempt_id) REFERENCES contact_call_attempts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

