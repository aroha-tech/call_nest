-- ============================================
-- SEED: Platform Tenant
-- Creates the platform tenant (id=1) for super admin
-- Must run after tenants table is created
-- ============================================

INSERT INTO tenants (id, name, slug, is_enabled) 
VALUES (1, 'Platform', 'platform', 1)
ON DUPLICATE KEY UPDATE id=id;

SELECT 'Platform tenant created (id=1)' AS status;
