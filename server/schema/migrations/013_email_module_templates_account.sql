-- Add email_account_id to email_module_templates so templates can be scoped per sending account.
-- Run after 012. From project root:
-- mysql -u root -p call_nest < server/schema/migrations/013_email_module_templates_account.sql

ALTER TABLE email_module_templates
  ADD COLUMN email_account_id BIGINT UNSIGNED NULL AFTER tenant_id;

ALTER TABLE email_module_templates
  ADD INDEX idx_email_module_templates_account (tenant_id, email_account_id);

