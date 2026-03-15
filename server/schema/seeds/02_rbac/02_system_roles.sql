-- ============================================
-- SEED: System Roles
-- Creates admin, manager, agent roles for each tenant
-- Safe to re-run: uses INSERT IGNORE to prevent duplicates
-- Platform tenant (id=1) excluded - platform admins don't use tenant roles
-- ============================================

-- Admin role for all tenants
INSERT IGNORE INTO roles (tenant_id, name, description, is_system_role)
SELECT 
  t.id,
  'admin',
  'Full tenant administration access',
  1
FROM tenants t
WHERE t.id > 1 AND t.is_deleted = 0;

-- Manager role for all tenants
INSERT IGNORE INTO roles (tenant_id, name, description, is_system_role)
SELECT 
  t.id,
  'manager',
  'Team management and monitoring access',
  1
FROM tenants t
WHERE t.id > 1 AND t.is_deleted = 0;

-- Agent role for all tenants
INSERT IGNORE INTO roles (tenant_id, name, description, is_system_role)
SELECT 
  t.id,
  'agent',
  'Basic agent access for dialing and contact handling',
  1
FROM tenants t
WHERE t.id > 1 AND t.is_deleted = 0;

SELECT 'System roles created for all tenants' AS status;
