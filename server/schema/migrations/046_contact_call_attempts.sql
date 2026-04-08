-- Call / dial attempts history for leads/contacts (tenant-scoped, append-only).
-- Provider-agnostic: provider + provider_call_id are optional.
-- Run: mysql -u root -p call_nest < server/schema/migrations/046_contact_call_attempts.sql

CREATE TABLE IF NOT EXISTS contact_call_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  contact_id BIGINT UNSIGNED NOT NULL,
  contact_phone_id BIGINT UNSIGNED NULL,

  agent_user_id BIGINT UNSIGNED NULL,
  manager_id BIGINT UNSIGNED NULL,

  provider VARCHAR(32) NOT NULL DEFAULT 'dummy',
  provider_call_id VARCHAR(128) NULL,

  direction ENUM('outbound','inbound') NOT NULL DEFAULT 'outbound',
  status ENUM('queued','ringing','connected','completed','failed','cancelled') NOT NULL DEFAULT 'completed',
  is_connected TINYINT(1) NOT NULL DEFAULT 0,

  disposition_id CHAR(36) NULL,
  notes TEXT NULL,

  started_at TIMESTAMP NULL DEFAULT NULL,
  ended_at TIMESTAMP NULL DEFAULT NULL,
  duration_sec INT UNSIGNED NULL,

  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_cca_tenant_created (tenant_id, created_at),
  KEY idx_cca_tenant_contact_created (tenant_id, contact_id, created_at),
  KEY idx_cca_tenant_agent_created (tenant_id, agent_user_id, created_at),
  KEY idx_cca_tenant_phone_created (tenant_id, contact_phone_id, created_at),

  CONSTRAINT fk_cca_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_cca_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  CONSTRAINT fk_cca_phone FOREIGN KEY (contact_phone_id) REFERENCES contact_phones(id) ON DELETE SET NULL,
  CONSTRAINT fk_cca_agent FOREIGN KEY (agent_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_cca_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_cca_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

