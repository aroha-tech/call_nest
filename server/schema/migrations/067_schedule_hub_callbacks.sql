-- ============================================
-- Migration 067: Schedule hub — scheduled callbacks + meeting ownership / attendance
-- mysql -u root -p call_nest < server/schema/migrations/067_schedule_hub_callbacks.sql
-- ============================================

CREATE TABLE IF NOT EXISTS scheduled_callbacks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  contact_id BIGINT UNSIGNED NOT NULL,
  contact_phone_id BIGINT UNSIGNED NULL,
  assigned_user_id BIGINT UNSIGNED NOT NULL,
  scheduled_at DATETIME NOT NULL,
  status ENUM('pending', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  notes TEXT NULL,
  source_call_attempt_id BIGINT UNSIGNED NULL,
  completed_call_attempt_id BIGINT UNSIGNED NULL,
  completed_at DATETIME NULL,
  outcome_notes TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_sc_tenant_scheduled (tenant_id, scheduled_at),
  KEY idx_sc_tenant_assigned (tenant_id, assigned_user_id, scheduled_at),
  KEY idx_sc_tenant_status (tenant_id, status, scheduled_at),
  KEY idx_sc_tenant_deleted (tenant_id, deleted_at),
  CONSTRAINT fk_sc_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_sc_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  CONSTRAINT fk_sc_phone FOREIGN KEY (contact_phone_id) REFERENCES contact_phones(id) ON DELETE SET NULL,
  CONSTRAINT fk_sc_assigned FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sc_source_attempt FOREIGN KEY (source_call_attempt_id) REFERENCES contact_call_attempts(id) ON DELETE SET NULL,
  CONSTRAINT fk_sc_completed_attempt FOREIGN KEY (completed_call_attempt_id) REFERENCES contact_call_attempts(id) ON DELETE SET NULL,
  CONSTRAINT fk_sc_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_sc_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_sc_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE tenant_meetings
  ADD COLUMN contact_id BIGINT UNSIGNED NULL DEFAULT NULL AFTER tenant_id,
  ADD COLUMN assigned_user_id BIGINT UNSIGNED NULL DEFAULT NULL AFTER contact_id,
  ADD COLUMN attendance_status ENUM('unknown', 'attended', 'no_show', 'cancelled') NOT NULL DEFAULT 'unknown' AFTER meeting_status;

ALTER TABLE tenant_meetings
  ADD KEY idx_tm_tenant_assigned (tenant_id, assigned_user_id),
  ADD KEY idx_tm_tenant_contact (tenant_id, contact_id);

ALTER TABLE tenant_meetings
  ADD CONSTRAINT fk_tm_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_tm_assigned_user FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL;

INSERT IGNORE INTO permissions (code, description) VALUES
  ('schedule.view', 'View schedule hub (callbacks, meetings summary)'),
  ('schedule.manage', 'Create and assign scheduled callbacks for the team');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin' AND r.is_system_role = 1
  AND p.code IN ('schedule.view', 'schedule.manage');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'manager' AND r.is_system_role = 1
  AND p.code IN ('schedule.view', 'schedule.manage');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'agent' AND r.is_system_role = 1
  AND p.code IN ('schedule.view');
