-- Run all template migrations in order
-- Execute from server directory: mysql -u root -p call_nest < schema/templates/run_all.sql

SOURCE schema/templates/01_email_templates.sql;
SOURCE schema/templates/02_whatsapp_templates.sql;
