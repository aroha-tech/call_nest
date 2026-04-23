-- Tenant meetings (calendar; linked to email_accounts)
-- Apply via migrations/058_tenant_meetings.sql (includes permissions).
-- CRM columns (contact, assignee, attendance): migrations/067_schedule_hub_callbacks.sql

CREATE TABLE IF NOT EXISTS tenant_meetings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  email_account_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT NULL,
  location VARCHAR(500) NULL,
  attendee_email VARCHAR(255) NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  meeting_status ENUM('scheduled', 'completed', 'cancelled', 'rescheduled') NOT NULL DEFAULT 'scheduled',
  meeting_platform ENUM('google_meet', 'microsoft_teams', 'custom') NOT NULL DEFAULT 'google_meet',
  meeting_link VARCHAR(1000) NULL,
  meeting_duration_min INT UNSIGNED NOT NULL DEFAULT 30,
  meeting_owner_user_id BIGINT UNSIGNED NULL,
  provider_event_id VARCHAR(255) NULL,
  provider_calendar_id VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_tm_tenant_start (tenant_id, start_at),
  KEY idx_tm_tenant_status (tenant_id, meeting_status),
  KEY idx_tm_platform (tenant_id, meeting_platform),
  KEY idx_tm_owner (tenant_id, meeting_owner_user_id),
  KEY idx_tm_provider_event (tenant_id, provider_event_id),
  KEY idx_tm_email (tenant_id, email_account_id),
  KEY idx_tm_tenant_deleted (tenant_id, deleted_at),
  CONSTRAINT fk_tm_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_tm_email_account FOREIGN KEY (email_account_id) REFERENCES email_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tm_meeting_owner_user FOREIGN KEY (meeting_owner_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
