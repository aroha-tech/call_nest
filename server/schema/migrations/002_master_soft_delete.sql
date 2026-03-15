-- ============================================
-- MIGRATION 002: Add soft delete to master tables
-- Adds is_deleted and deleted_at columns
-- 
-- Run this if upgrading from a version before soft delete support
-- ============================================

-- 1. Industries
ALTER TABLE industries
ADD COLUMN IF NOT EXISTS is_deleted TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER is_deleted;

ALTER TABLE industries
ADD INDEX IF NOT EXISTS idx_industries_deleted (is_deleted);

-- 2. Disposition Types Master
ALTER TABLE dispo_types_master
ADD COLUMN IF NOT EXISTS is_deleted TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER is_deleted;

ALTER TABLE dispo_types_master
ADD INDEX IF NOT EXISTS idx_dispo_types_deleted (is_deleted);

-- 3. Disposition Actions Master
ALTER TABLE dispo_actions_master
ADD COLUMN IF NOT EXISTS is_deleted TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER is_deleted;

ALTER TABLE dispo_actions_master
ADD INDEX IF NOT EXISTS idx_dispo_actions_deleted (is_deleted);

-- 4. Contact Status Master
ALTER TABLE contact_status_master
ADD COLUMN IF NOT EXISTS is_deleted TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER is_deleted;

ALTER TABLE contact_status_master
ADD INDEX IF NOT EXISTS idx_contact_status_deleted (is_deleted);

-- 5. Contact Temperature Master
ALTER TABLE contact_temperature_master
ADD COLUMN IF NOT EXISTS is_deleted TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER is_deleted;

ALTER TABLE contact_temperature_master
ADD INDEX IF NOT EXISTS idx_contact_temperature_deleted (is_deleted);

SELECT 'Migration 002 completed: Soft delete added to master tables!' AS status;
