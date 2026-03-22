-- Import history for CSV contact/lead imports (tenant-scoped).
-- Run: mysql -u root -p call_nest < server/schema/migrations/025_contact_import_batches.sql

CREATE TABLE IF NOT EXISTS contact_import_batches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  contact_type VARCHAR(32) NOT NULL DEFAULT 'lead',
  original_filename VARCHAR(512) NULL,
  mode VARCHAR(16) NOT NULL DEFAULT 'skip',
  default_country_code VARCHAR(16) NULL,
  row_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_count INT UNSIGNED NOT NULL DEFAULT 0,
  updated_count INT UNSIGNED NOT NULL DEFAULT 0,
  skipped_count INT UNSIGNED NOT NULL DEFAULT 0,
  failed_count INT UNSIGNED NOT NULL DEFAULT 0,
  error_sample_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_contact_import_batches_tenant_created (tenant_id, created_at),
  CONSTRAINT fk_contact_import_batches_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_contact_import_batches_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
