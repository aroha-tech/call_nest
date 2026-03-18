-- ============================================
-- Contact Module - Create All Tables
-- Run this file to create all contact-related tables
--
-- Usage from MySQL:
--   SOURCE D:/own_software/call_nest/server/schema/contact/run_all.sql
-- ============================================

SELECT '======================================' AS '';
SELECT '  Creating Contact Module Tables' AS '';
SELECT '======================================' AS '';

SELECT '' AS '';
SELECT '--- [01-04] Contact Tables ---' AS '';

SOURCE D:/own_software/call_nest/server/schema/contact/01_contacts.sql;
SOURCE D:/own_software/call_nest/server/schema/contact/02_contact_phones.sql;
SOURCE D:/own_software/call_nest/server/schema/contact/03_contact_custom_fields.sql;
SOURCE D:/own_software/call_nest/server/schema/contact/04_contact_custom_field_values.sql;

SELECT '' AS '';
SELECT '======================================' AS '';
SELECT '  Contact Tables Created!' AS '';
SELECT '======================================' AS '';

