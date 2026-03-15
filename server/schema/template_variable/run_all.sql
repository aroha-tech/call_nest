-- Run all template_variable migrations in order
-- Execute from server directory: mysql -u root -p call_nest < schema/template_variable/run_all.sql

SOURCE schema/template_variable/01_template_variables.sql;
