-- ============================================
-- Migration 059: Editable meeting notification email templates (per tenant)
-- mysql -u root -p call_nest < server/schema/migrations/059_tenant_meeting_email_templates.sql
-- Or: USE call_nest; SOURCE server/schema/migrations/059_tenant_meeting_email_templates.sql;
-- ============================================

CREATE TABLE IF NOT EXISTS tenant_meeting_email_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
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
  UNIQUE KEY uk_tmet_tenant_kind (tenant_id, template_kind),
  KEY idx_tmet_tenant_deleted (tenant_id, deleted_at),
  CONSTRAINT fk_tmet_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
