-- ============================================
-- Migration 058: Tenant meetings (calendar; per email account)
-- mysql -u root -p call_nest < server/schema/migrations/058_tenant_meetings.sql
-- ============================================

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
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_tm_tenant_start (tenant_id, start_at),
  KEY idx_tm_tenant_status (tenant_id, meeting_status),
  KEY idx_tm_email (tenant_id, email_account_id),
  KEY idx_tm_tenant_deleted (tenant_id, deleted_at),
  CONSTRAINT fk_tm_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_tm_email_account FOREIGN KEY (email_account_id) REFERENCES email_accounts(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO permissions (code, description) VALUES
  ('meetings.view', 'View meetings calendar and list'),
  ('meetings.manage', 'Create, edit, and delete meetings');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin' AND r.is_system_role = 1
  AND p.code IN ('meetings.view', 'meetings.manage');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'manager' AND r.is_system_role = 1
  AND p.code IN ('meetings.view', 'meetings.manage');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'agent' AND r.is_system_role = 1
  AND p.code IN ('meetings.view', 'meetings.manage');
