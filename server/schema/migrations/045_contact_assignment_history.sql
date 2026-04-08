-- Track lead/contact assignment changes (tenant-scoped, append-only).
-- Run: mysql -u root -p call_nest < server/schema/migrations/045_contact_assignment_history.sql

CREATE TABLE IF NOT EXISTS contact_assignment_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  contact_id BIGINT UNSIGNED NOT NULL,

  changed_by_user_id BIGINT UNSIGNED NULL,
  change_source ENUM('manual','import','api','integration','system') NOT NULL DEFAULT 'manual',
  change_reason VARCHAR(255) NULL,

  from_manager_id BIGINT UNSIGNED NULL,
  to_manager_id BIGINT UNSIGNED NULL,
  from_assigned_user_id BIGINT UNSIGNED NULL,
  to_assigned_user_id BIGINT UNSIGNED NULL,
  from_campaign_id BIGINT UNSIGNED NULL,
  to_campaign_id BIGINT UNSIGNED NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_cah_tenant_created (tenant_id, created_at),
  KEY idx_cah_tenant_contact_created (tenant_id, contact_id, created_at),
  KEY idx_cah_tenant_to_agent_created (tenant_id, to_assigned_user_id, created_at),
  KEY idx_cah_tenant_to_manager_created (tenant_id, to_manager_id, created_at),

  CONSTRAINT fk_cah_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_cah_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  CONSTRAINT fk_cah_changed_by FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_cah_from_manager FOREIGN KEY (from_manager_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_cah_to_manager FOREIGN KEY (to_manager_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_cah_from_assigned FOREIGN KEY (from_assigned_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_cah_to_assigned FOREIGN KEY (to_assigned_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

