-- ============================================
-- MASTER SEED RUNNER
-- Runs all seed scripts in correct order
-- 
-- Usage from MySQL:
--   SOURCE D:/own_software/call_nest/server/schema/seeds/run_all_seeds.sql
--
-- Or from PowerShell:
--   Get-Content server/schema/seeds/run_all_seeds.sql | mysql -u root -p call_nest
-- ============================================

SET FOREIGN_KEY_CHECKS = 0;

SELECT '======================================' AS '';
SELECT '  Starting Seed Data Import' AS '';
SELECT '======================================' AS '';

-- ============================================
-- 01. SYSTEM SEEDS
-- ============================================
SELECT '' AS '';
SELECT '--- [01] System Seeds ---' AS '';

SOURCE D:/own_software/call_nest/server/schema/seeds/01_system/01_platform_tenant.sql;

-- ============================================
-- 02. RBAC SEEDS
-- ============================================
SELECT '' AS '';
SELECT '--- [02] RBAC Seeds ---' AS '';

SOURCE D:/own_software/call_nest/server/schema/seeds/02_rbac/01_permissions.sql;
SOURCE D:/own_software/call_nest/server/schema/seeds/02_rbac/02_system_roles.sql;
SOURCE D:/own_software/call_nest/server/schema/seeds/02_rbac/03_role_permissions.sql;

-- ============================================
-- 03. MASTER DATA SEEDS
-- ============================================
SELECT '' AS '';
SELECT '--- [03] Master Data Seeds ---' AS '';

SOURCE D:/own_software/call_nest/server/schema/seeds/03_master/01_industries.sql;
SOURCE D:/own_software/call_nest/server/schema/seeds/03_master/02_dispo_types.sql;
SOURCE D:/own_software/call_nest/server/schema/seeds/03_master/03_dispo_actions.sql;
SOURCE D:/own_software/call_nest/server/schema/seeds/03_master/04_contact_statuses.sql;
SOURCE D:/own_software/call_nest/server/schema/seeds/03_master/05_contact_temperatures.sql;
SOURCE D:/own_software/call_nest/server/schema/seeds/03_master/06_template_variables.sql;
SOURCE D:/own_software/call_nest/server/schema/seeds/03_master/08_campaign_types_master.sql;
SOURCE D:/own_software/call_nest/server/schema/seeds/03_master/09_campaign_statuses_master.sql;

SET FOREIGN_KEY_CHECKS = 1;

SELECT '' AS '';
SELECT '======================================' AS '';
SELECT '  Seed Data Import Complete!' AS '';
SELECT '======================================' AS '';
