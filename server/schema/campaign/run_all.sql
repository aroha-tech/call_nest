-- ============================================
-- Campaign Module - Create All Tables
-- Run this file to create all campaign-related tables
--
-- Usage from MySQL:
--   SOURCE D:/own_software/call_nest/server/schema/campaign/run_all.sql
-- ============================================

SELECT '======================================' AS '';
SELECT '  Creating Campaign Module Tables' AS '';
SELECT '======================================' AS '';

SELECT '' AS '';
SELECT '--- [01] Campaign Tables ---' AS '';

SOURCE ./01_campaigns.sql;

SELECT '' AS '';
SELECT '======================================' AS '';
SELECT '  Campaign Tables Created!' AS '';
SELECT '======================================' AS '';

