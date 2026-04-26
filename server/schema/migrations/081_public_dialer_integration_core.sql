USE call_nest;

CREATE TABLE IF NOT EXISTS integration_apps (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  provider_code VARCHAR(64) NOT NULL DEFAULT 'custom',
  api_key_hash CHAR(64) NOT NULL,
  api_key_hint VARCHAR(16) NULL,
  scopes_json JSON NULL,
  webhook_secret VARCHAR(255) NULL,
  requests_per_minute INT UNSIGNED NOT NULL DEFAULT 120,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_integration_apps_tenant_name (tenant_id, name),
  INDEX idx_integration_apps_tenant_active (tenant_id, is_active, deleted_at),
  INDEX idx_integration_apps_key_hash (api_key_hash),
  INDEX idx_integration_apps_tenant_id (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS integration_entity_mappings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  integration_app_id BIGINT UNSIGNED NOT NULL,
  external_crm VARCHAR(64) NOT NULL,
  entity_type VARCHAR(32) NOT NULL,
  external_id VARCHAR(191) NOT NULL,
  internal_id BIGINT UNSIGNED NOT NULL,
  metadata_json JSON NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_integration_map_unique (tenant_id, integration_app_id, external_crm, entity_type, external_id),
  INDEX idx_integration_map_internal_lookup (tenant_id, entity_type, internal_id, deleted_at),
  INDEX idx_integration_map_tenant_id (tenant_id, id),
  CONSTRAINT fk_integration_map_app FOREIGN KEY (integration_app_id) REFERENCES integration_apps(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
