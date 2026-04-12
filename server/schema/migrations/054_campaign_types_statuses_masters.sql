-- ============================================
-- Migration 054: Campaign type/status masters + campaigns columns
-- TiDB: run ADD COLUMN statements separately if multi-ADD with AFTER fails.
-- mysql -u root -p call_nest < server/schema/migrations/054_campaign_types_statuses_masters.sql
-- ============================================

CREATE TABLE IF NOT EXISTS campaign_types_master (
  id CHAR(36) PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_campaign_types_master_code (code),
  INDEX idx_campaign_types_master_active (is_active),
  INDEX idx_campaign_types_master_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS campaign_statuses_master (
  id CHAR(36) PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_campaign_statuses_master_code (code),
  INDEX idx_campaign_statuses_master_active (is_active),
  INDEX idx_campaign_statuses_master_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE campaigns ADD COLUMN description TEXT NULL;
ALTER TABLE campaigns ADD COLUMN campaign_type_master_id CHAR(36) NULL;
ALTER TABLE campaigns ADD COLUMN campaign_status_master_id CHAR(36) NULL;

ALTER TABLE campaigns
  ADD CONSTRAINT fk_campaigns_campaign_type_master
    FOREIGN KEY (campaign_type_master_id) REFERENCES campaign_types_master(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_campaigns_campaign_status_master
    FOREIGN KEY (campaign_status_master_id) REFERENCES campaign_statuses_master(id) ON DELETE SET NULL;

ALTER TABLE campaigns
  ADD INDEX idx_campaigns_campaign_type (tenant_id, campaign_type_master_id),
  ADD INDEX idx_campaigns_campaign_status (tenant_id, campaign_status_master_id);
