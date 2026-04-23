-- Email campaign + bulk recipient tables (tenant-scoped).
-- Paste-ready SQL for SQL editors:
--   USE call_nest;
--   SOURCE server/schema/migrations/073_email_campaigns_bulk.sql;
--
-- File-based run from project root:
--   mysql -u root -p call_nest < server/schema/migrations/073_email_campaigns_bulk.sql
--   (or in mysql client after USE call_nest;)
--   source server/schema/migrations/073_email_campaigns_bulk.sql;

CREATE TABLE IF NOT EXISTS email_campaigns (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  email_account_id BIGINT UNSIGNED NOT NULL,
  template_id BIGINT UNSIGNED NULL,
  subject VARCHAR(500) NULL,
  body_html LONGTEXT NULL,
  body_text TEXT NULL,
  status ENUM('draft','scheduled','queued','running','paused','completed','failed','cancelled')
    NOT NULL DEFAULT 'draft',
  schedule_at TIMESTAMP NULL DEFAULT NULL,
  started_at TIMESTAMP NULL DEFAULT NULL,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  total_recipients INT UNSIGNED NOT NULL DEFAULT 0,
  sent_count INT UNSIGNED NOT NULL DEFAULT 0,
  failed_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_email_campaigns_tenant_status (tenant_id, status, deleted_at),
  KEY idx_email_campaigns_tenant_schedule (tenant_id, schedule_at, deleted_at),
  KEY idx_email_campaigns_tenant_created (tenant_id, created_at, deleted_at),
  CONSTRAINT fk_email_campaigns_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_email_campaigns_account FOREIGN KEY (email_account_id) REFERENCES email_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT fk_email_campaigns_template FOREIGN KEY (template_id) REFERENCES email_module_templates(id) ON DELETE SET NULL,
  CONSTRAINT fk_email_campaigns_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_email_campaigns_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_email_campaigns_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_campaign_recipients (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  campaign_id BIGINT UNSIGNED NOT NULL,
  contact_id BIGINT UNSIGNED NULL,
  recipient_name VARCHAR(255) NULL,
  recipient_email VARCHAR(255) NOT NULL,
  status ENUM('pending','sent','failed','skipped') NOT NULL DEFAULT 'pending',
  error_message TEXT NULL,
  email_message_id BIGINT UNSIGNED NULL,
  sent_at TIMESTAMP NULL DEFAULT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_email_campaign_recipient (tenant_id, campaign_id, recipient_email, deleted_at),
  KEY idx_email_campaign_recipients_campaign_status (tenant_id, campaign_id, status, deleted_at),
  KEY idx_email_campaign_recipients_contact (tenant_id, contact_id, deleted_at),
  CONSTRAINT fk_email_campaign_recipients_campaign FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_email_campaign_recipients_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  CONSTRAINT fk_email_campaign_recipients_message FOREIGN KEY (email_message_id) REFERENCES email_messages(id) ON DELETE SET NULL,
  CONSTRAINT fk_email_campaign_recipients_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_email_campaign_recipients_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_email_campaign_recipients_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_email_campaign_recipients_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
