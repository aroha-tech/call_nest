-- Tenant-scoped blacklist entries for contacts/leads and phone numbers.

USE call_nest;

CREATE TABLE IF NOT EXISTS contact_blacklist_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  contact_id BIGINT UNSIGNED NULL,
  phone_e164 VARCHAR(32) NULL,
  block_scope ENUM('lead','contact','number') NOT NULL,
  reason VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_blacklist_tenant_deleted (tenant_id, deleted_at),
  KEY idx_blacklist_tenant_contact (tenant_id, contact_id, deleted_at),
  KEY idx_blacklist_tenant_phone (tenant_id, phone_e164, deleted_at),
  KEY idx_blacklist_tenant_scope (tenant_id, block_scope, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
