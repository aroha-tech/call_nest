-- Run from MySQL CLI after USE call_nest; use full path to this folder, e.g.:
-- source D:/own_software/call_nest/server/schema/whatsapp/run_all.sql
SOURCE 01_whatsapp_accounts.sql;
SOURCE 02_whatsapp_templates.sql;
SOURCE 03_whatsapp_template_components.sql;
SOURCE 04_whatsapp_messages.sql;
SOURCE 05_whatsapp_api_logs.sql;
