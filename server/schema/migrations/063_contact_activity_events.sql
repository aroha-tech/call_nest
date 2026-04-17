-- Append-only CRM timeline events for a lead/contact (profile saves beyond assignment/call/etc.).
-- Run: mysql -u root -p call_nest < server/schema/migrations/063_contact_activity_events.sql
-- Or: USE call_nest; SOURCE server/schema/migrations/063_contact_activity_events.sql;

CREATE TABLE IF NOT EXISTS contact_activity_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  contact_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  summary VARCHAR(500) NULL,
  payload_json JSON NULL,
  ref_call_attempt_id BIGINT UNSIGNED NULL,
  ref_dialer_session_id BIGINT UNSIGNED NULL,
  ref_whatsapp_message_id BIGINT UNSIGNED NULL,
  ref_email_message_id BIGINT UNSIGNED NULL,
  ref_opportunity_id BIGINT UNSIGNED NULL,
  ref_assignment_history_id BIGINT UNSIGNED NULL,
  ref_import_batch_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_cae_tenant_contact_created (tenant_id, contact_id, created_at),
  CONSTRAINT fk_cae_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_cae_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  CONSTRAINT fk_cae_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_cae_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_cae_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_cae_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
