-- ============================================
-- MIGRATION 001: Support "All Industries"
-- Adds industry_id to tenants and allows NULL industry for global defaults
-- 
-- Run this if upgrading from a version before industry support
-- ============================================

-- 1. Add industry_id to tenants table (for registration)
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS industry_id CHAR(36) NULL AFTER slug;

-- Add foreign key if it doesn't exist (MySQL 8.0.16+)
-- If on older MySQL, manually check and add
ALTER TABLE tenants
ADD CONSTRAINT fk_tenants_industry FOREIGN KEY (industry_id) 
  REFERENCES industries(id) ON DELETE SET NULL;

ALTER TABLE tenants
ADD INDEX IF NOT EXISTS idx_tenants_industry (industry_id);

-- 2. Make industry_id nullable in default_dispositions for "All Industries"
ALTER TABLE default_dispositions
MODIFY COLUMN industry_id CHAR(36) NULL;

-- 3. Make industry_id nullable in default_dialing_sets for "All Industries"
ALTER TABLE default_dialing_sets
MODIFY COLUMN industry_id CHAR(36) NULL;

SELECT 'Migration 001 completed: Industry support added!' AS status;
