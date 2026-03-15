-- ============================================
-- Disposition Module - Create All Tables
-- Run this file to create all disposition-related tables
-- 
-- Usage from MySQL:
--   SOURCE D:/own_software/call_nest/server/schema/disposition/run_all.sql
-- ============================================

SELECT '======================================' AS '';
SELECT '  Creating Disposition Module Tables' AS '';
SELECT '======================================' AS '';

-- ========================================
-- MASTER TABLES (Global - Super Admin)
-- ========================================

SELECT '' AS '';
SELECT '--- [01-05] Master Tables ---' AS '';

SOURCE D:/own_software/call_nest/server/schema/disposition/01_industries.sql;
SOURCE D:/own_software/call_nest/server/schema/disposition/02_dispo_types_master.sql;
SOURCE D:/own_software/call_nest/server/schema/disposition/03_dispo_actions_master.sql;
SOURCE D:/own_software/call_nest/server/schema/disposition/04_contact_status_master.sql;
SOURCE D:/own_software/call_nest/server/schema/disposition/05_contact_temperature_master.sql;

-- ========================================
-- DEFAULT TEMPLATES (Global - Super Admin)
-- ========================================

SELECT '' AS '';
SELECT '--- [06-09] Default Templates ---' AS '';

SOURCE D:/own_software/call_nest/server/schema/disposition/06_default_dispositions.sql;
SOURCE D:/own_software/call_nest/server/schema/disposition/07_default_dialing_sets.sql;
SOURCE D:/own_software/call_nest/server/schema/disposition/08_default_dialing_set_dispositions.sql;
SOURCE D:/own_software/call_nest/server/schema/disposition/09_default_disposition_actions_map.sql;

-- ========================================
-- TENANT TABLES
-- ========================================

SELECT '' AS '';
SELECT '--- [10-13] Tenant Tables ---' AS '';

SOURCE D:/own_software/call_nest/server/schema/disposition/10_dialing_sets.sql;
SOURCE D:/own_software/call_nest/server/schema/disposition/11_dispositions.sql;
SOURCE D:/own_software/call_nest/server/schema/disposition/12_dialing_set_dispositions.sql;
SOURCE D:/own_software/call_nest/server/schema/disposition/13_disposition_actions_map.sql;

SELECT '' AS '';
SELECT '======================================' AS '';
SELECT '  Disposition Tables Created!' AS '';
SELECT '======================================' AS '';
