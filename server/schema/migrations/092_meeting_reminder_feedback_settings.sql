-- ============================================
-- Migration 092: Per-user meeting reminder + feedback settings
-- Paste-ready SQL for SQL editors:
--   USE call_nest;
--   SOURCE server/schema/migrations/092_meeting_reminder_feedback_settings.sql;
--
-- File-based run from project root:
--   mysql -u root -p call_nest < server/schema/migrations/092_meeting_reminder_feedback_settings.sql
--   -- or inside MySQL after USE call_nest;
--   source server/schema/migrations/092_meeting_reminder_feedback_settings.sql
-- ============================================

CREATE TABLE IF NOT EXISTS tenant_user_meeting_email_settings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  reminder_enabled TINYINT(1) NOT NULL DEFAULT 1,
  reminder_offsets_json JSON NULL,
  reminder_subject VARCHAR(500) NOT NULL,
  reminder_body_html LONGTEXT NULL,
  reminder_body_text TEXT NULL,
  feedback_enabled TINYINT(1) NOT NULL DEFAULT 1,
  feedback_delay_value INT UNSIGNED NOT NULL DEFAULT 2,
  feedback_delay_unit ENUM('minutes', 'hours', 'days') NOT NULL DEFAULT 'hours',
  feedback_subject VARCHAR(500) NOT NULL,
  feedback_body_html LONGTEXT NULL,
  feedback_body_text TEXT NULL,
  thank_you_page_url VARCHAR(1000) NULL,
  include_meeting_details TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_tumes_tenant_user (tenant_id, user_id),
  KEY idx_tumes_tenant_deleted (tenant_id, deleted_at),
  CONSTRAINT fk_tumes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_tumes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tenant_meeting_reminder_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  meeting_id BIGINT UNSIGNED NOT NULL,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  offset_minutes INT UNSIGNED NOT NULL,
  delivery_status ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
  last_error TEXT NULL,
  sent_at TIMESTAMP NULL DEFAULT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_tmre_meeting_user_offset (tenant_id, meeting_id, owner_user_id, offset_minutes),
  KEY idx_tmre_tenant_deleted (tenant_id, deleted_at),
  KEY idx_tmre_delivery (tenant_id, delivery_status, sent_at),
  CONSTRAINT fk_tmre_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_tmre_meeting FOREIGN KEY (meeting_id) REFERENCES tenant_meetings(id) ON DELETE CASCADE,
  CONSTRAINT fk_tmre_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tenant_meeting_feedback_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  meeting_id BIGINT UNSIGNED NOT NULL,
  requester_user_id BIGINT UNSIGNED NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  feedback_token CHAR(64) NOT NULL,
  status ENUM('pending', 'sent', 'submitted', 'failed') NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMP NULL DEFAULT NULL,
  submitted_at TIMESTAMP NULL DEFAULT NULL,
  rating TINYINT UNSIGNED NULL,
  feedback_text TEXT NULL,
  notification_sent_at TIMESTAMP NULL DEFAULT NULL,
  last_error TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_tmfr_token (feedback_token),
  UNIQUE KEY uk_tmfr_meeting_requester (tenant_id, meeting_id, requester_user_id),
  KEY idx_tmfr_tenant_status (tenant_id, status, sent_at, submitted_at),
  KEY idx_tmfr_tenant_deleted (tenant_id, deleted_at),
  CONSTRAINT fk_tmfr_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_tmfr_meeting FOREIGN KEY (meeting_id) REFERENCES tenant_meetings(id) ON DELETE CASCADE,
  CONSTRAINT fk_tmfr_requester FOREIGN KEY (requester_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
