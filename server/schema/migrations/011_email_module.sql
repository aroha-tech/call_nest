
-- Email Module: accounts, templates, messages, events (tracking for paid plan)
-- Tenant flag: email_communication_enabled = 1 means Communication Plan (paid); 0 = Free plan
--
-- From project root: mysql -u root -p call_nest < server/schema/migrations/011_email_module.sql
-- Or inside MySQL: USE call_nest; SOURCE server/schema/migrations/011_email_module.sql;

-- 1) Tenant: Communication Plan (paid) enables tracking, automation, disposition triggers, analytics
ALTER TABLE tenants
  ADD COLUMN email_communication_enabled TINYINT(1) NOT NULL DEFAULT 0
  COMMENT '1 = Communication Plan (tracking, automation, disposition email); 0 = Free (basic send/inbox only)';

-- 2) Email accounts (Gmail OAuth, Outlook OAuth, or SMTP)
CREATE TABLE IF NOT EXISTS email_accounts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  provider ENUM('gmail','outlook','smtp') NOT NULL DEFAULT 'smtp',
  account_name VARCHAR(255) NULL,
  email_address VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NULL,
  -- OAuth: store encrypted refresh_token / access_token (app encrypts at rest)
  access_token TEXT NULL,
  refresh_token TEXT NULL,
  token_expires_at TIMESTAMP NULL,
  -- SMTP
  smtp_host VARCHAR(255) NULL,
  smtp_port INT NULL,
  smtp_secure TINYINT(1) NOT NULL DEFAULT 1,
  smtp_user VARCHAR(255) NULL,
  smtp_password_encrypted TEXT NULL,
  status ENUM('active','inactive') DEFAULT 'active',
  is_deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = soft deleted',
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email_accounts_tenant_id (tenant_id),
  INDEX idx_email_accounts_tenant_status (tenant_id, status),
  INDEX idx_email_accounts_email (tenant_id, email_address),
  INDEX idx_email_accounts_deleted (tenant_id, is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) Email templates (module templates; subject + body with variables)
CREATE TABLE IF NOT EXISTS email_templates (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  body_html LONGTEXT NULL,
  body_text TEXT NULL,
  status ENUM('active','inactive') DEFAULT 'active',
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email_templates_tenant_id (tenant_id),
  INDEX idx_email_templates_tenant_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) Email messages (inbox + sent; link to contact for timeline)
CREATE TABLE IF NOT EXISTS email_messages (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  email_account_id BIGINT UNSIGNED NULL,
  contact_id BIGINT UNSIGNED NULL,
  thread_id VARCHAR(255) NULL COMMENT 'Conversation thread id for grouping',
  message_id_header VARCHAR(500) NULL COMMENT 'Message-ID / In-Reply-To for threading',
  direction ENUM('inbound','outbound') NOT NULL DEFAULT 'outbound',
  status ENUM('draft','sent','received','failed') DEFAULT 'sent',
  from_email VARCHAR(255) NOT NULL,
  to_email VARCHAR(500) NOT NULL,
  cc_email VARCHAR(1000) NULL,
  bcc_email VARCHAR(1000) NULL,
  subject VARCHAR(1000) NULL,
  body_html LONGTEXT NULL,
  body_text TEXT NULL,
  template_id BIGINT UNSIGNED NULL,
  sent_at TIMESTAMP NULL,
  received_at TIMESTAMP NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email_messages_tenant_id (tenant_id),
  INDEX idx_email_messages_account (tenant_id, email_account_id),
  INDEX idx_email_messages_contact (tenant_id, contact_id),
  INDEX idx_email_messages_thread (tenant_id, thread_id),
  INDEX idx_email_messages_direction_status (tenant_id, direction, status),
  INDEX idx_email_messages_sent_at (tenant_id, sent_at),
  INDEX idx_email_messages_created_at (tenant_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5) Email attachments (per message)
CREATE TABLE IF NOT EXISTS email_attachments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  email_message_id BIGINT UNSIGNED NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  content_type VARCHAR(255) NULL,
  file_size INT UNSIGNED NULL,
  storage_path VARCHAR(500) NULL COMMENT 'Path or key in storage',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email_attachments_message (email_message_id),
  INDEX idx_email_attachments_tenant (tenant_id),
  FOREIGN KEY (email_message_id) REFERENCES email_messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6) Email events (open, click, reply) — paid plan only; full event logging
CREATE TABLE IF NOT EXISTS email_events (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  email_message_id BIGINT UNSIGNED NOT NULL,
  event_type ENUM('sent','delivered','opened','link_click','reply','bounce','complaint') NOT NULL,
  payload JSON NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email_events_tenant_id (tenant_id),
  INDEX idx_email_events_message (email_message_id),
  INDEX idx_email_events_type_created (tenant_id, event_type, created_at),
  FOREIGN KEY (email_message_id) REFERENCES email_messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
