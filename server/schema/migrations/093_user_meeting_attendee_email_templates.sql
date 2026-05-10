-- ============================================
-- Migration 093: Per-user meeting attendee email templates (created/updated/cancelled)
-- Paste-ready SQL for SQL editors:
--   USE call_nest;
--   SOURCE server/schema/migrations/093_user_meeting_attendee_email_templates.sql;
--
-- File-based run from project root:
--   mysql -u root -p call_nest < server/schema/migrations/093_user_meeting_attendee_email_templates.sql
--   -- or inside MySQL after USE call_nest;
--   source server/schema/migrations/093_user_meeting_attendee_email_templates.sql
-- ============================================

CREATE TABLE IF NOT EXISTS tenant_user_meeting_attendee_email_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  template_kind ENUM('created', 'updated', 'cancelled') NOT NULL,
  subject VARCHAR(500) NOT NULL,
  body_html LONGTEXT NULL,
  body_text TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_tumat_tenant_user_kind (tenant_id, user_id, template_kind),
  
  KEY idx_tumat_tenant_deleted (tenant_id, deleted_at),
  CONSTRAINT fk_tumat_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_tumat_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
