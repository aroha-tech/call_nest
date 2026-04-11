-- Saved named list filters (leads, contacts, call history) per user.
-- Run: mysql -u root -p call_nest < server/schema/migrations/053_tenant_saved_list_filters.sql

CREATE TABLE IF NOT EXISTS tenant_saved_list_filters (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  entity_type VARCHAR(32) NOT NULL,
  name VARCHAR(255) NOT NULL,
  filter_json JSON NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_tenant_saved_filters_list (tenant_id, user_id, entity_type, deleted_at),
  CONSTRAINT fk_tsavedlf_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_tsavedlf_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_tsavedlf_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tsavedlf_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tsavedlf_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
