-- Tenant-scoped background jobs (imports, exports, bulk assign/tags/delete) with progress.
-- Run: mysql -u root -p call_nest < server/schema/migrations/065_tenant_background_jobs.sql
-- Or: USE call_nest; SOURCE server/schema/migrations/065_tenant_background_jobs.sql;

CREATE TABLE IF NOT EXISTS tenant_background_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  job_type VARCHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  progress_percent TINYINT UNSIGNED NOT NULL DEFAULT 0,
  processed_count INT UNSIGNED NOT NULL DEFAULT 0,
  total_count INT UNSIGNED NOT NULL DEFAULT 0,
  current_step VARCHAR(512) NULL,
  payload_json JSON NOT NULL,
  result_json JSON NULL,
  error_message TEXT NULL,
  artifact_path VARCHAR(1024) NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  started_at TIMESTAMP NULL DEFAULT NULL,
  finished_at TIMESTAMP NULL DEFAULT NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_tbj_tenant_status_created (tenant_id, deleted_at, status, created_at),
  KEY idx_tbj_tenant_type (tenant_id, deleted_at, job_type),
  CONSTRAINT fk_tbj_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_tbj_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tbj_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tbj_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
