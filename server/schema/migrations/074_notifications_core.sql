-- CRM notifications core tables (tenant-scoped).
-- Paste-ready SQL for SQL editors:
--   USE call_nest;
--   SOURCE server/schema/migrations/074_notifications_core.sql;
--
-- File-based run from project root:
--   mysql -u root -p call_nest < server/schema/migrations/074_notifications_core.sql
--   (or in mysql client after USE call_nest;)
--   source server/schema/migrations/074_notifications_core.sql;

CREATE TABLE IF NOT EXISTS tenant_notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  module_key VARCHAR(64) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  severity ENUM('critical', 'high', 'normal', 'low') NOT NULL DEFAULT 'normal',
  title VARCHAR(255) NOT NULL,
  body TEXT NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  entity_type VARCHAR(64) NULL,
  entity_id BIGINT UNSIGNED NULL,
  cta_path VARCHAR(500) NULL,
  metadata_json JSON NULL,
  event_hash VARCHAR(191) NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_tenant_notifications_tenant_created (tenant_id, created_at, deleted_at),
  KEY idx_tenant_notifications_tenant_module (tenant_id, module_key, created_at, deleted_at),
  KEY idx_tenant_notifications_tenant_event (tenant_id, event_type, created_at, deleted_at),
  KEY idx_tenant_notifications_tenant_severity (tenant_id, severity, created_at, deleted_at),
  KEY idx_tenant_notifications_tenant_entity (tenant_id, entity_type, entity_id, deleted_at),
  KEY idx_tenant_notifications_tenant_hash (tenant_id, event_hash, created_at, deleted_at),
  CONSTRAINT fk_tenant_notifications_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_tenant_notifications_actor_user FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tenant_notifications_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tenant_notifications_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tenant_notifications_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tenant_notification_recipients (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  notification_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  channel_in_app TINYINT(1) NOT NULL DEFAULT 1,
  channel_push TINYINT(1) NOT NULL DEFAULT 0,
  delivered_at DATETIME NULL,
  read_at DATETIME NULL,
  dismissed_at DATETIME NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenant_notification_recipient (tenant_id, notification_id, user_id, deleted_at),
  KEY idx_tenant_notification_recipients_user_read (tenant_id, user_id, read_at, deleted_at),
  KEY idx_tenant_notification_recipients_notification (tenant_id, notification_id, deleted_at),
  CONSTRAINT fk_tenant_notification_recipients_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_tenant_notification_recipients_notification FOREIGN KEY (notification_id) REFERENCES tenant_notifications(id) ON DELETE CASCADE,
  CONSTRAINT fk_tenant_notification_recipients_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_tenant_notification_recipients_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tenant_notification_recipients_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tenant_notification_recipients_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tenant_notification_preferences (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  module_key VARCHAR(64) NOT NULL,
  event_type VARCHAR(100) NOT NULL DEFAULT '*',
  in_app_enabled TINYINT(1) NOT NULL DEFAULT 1,
  push_enabled TINYINT(1) NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenant_notification_pref (tenant_id, user_id, module_key, event_type, deleted_at),
  KEY idx_tenant_notification_pref_user (tenant_id, user_id, deleted_at),
  CONSTRAINT fk_tenant_notification_pref_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_tenant_notification_pref_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_tenant_notification_pref_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tenant_notification_pref_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tenant_notification_pref_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tenant_push_subscriptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  endpoint VARCHAR(1200) NOT NULL,
  p256dh_key VARCHAR(255) NOT NULL,
  auth_key VARCHAR(255) NOT NULL,
  user_agent VARCHAR(500) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenant_push_subscription_endpoint (tenant_id, user_id, endpoint(255), deleted_at),
  KEY idx_tenant_push_subscription_user_active (tenant_id, user_id, is_active, deleted_at),
  CONSTRAINT fk_tenant_push_subscription_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_tenant_push_subscription_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_tenant_push_subscription_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tenant_push_subscription_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tenant_push_subscription_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO permissions (code, description) VALUES
  ('notifications.view', 'View CRM notifications and unread count'),
  ('notifications.manage', 'Manage CRM notification preferences and delivery settings');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('notifications.view', 'notifications.manage')
WHERE r.is_system_role = 1
  AND r.name IN ('admin', 'manager');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('notifications.view')
WHERE r.is_system_role = 1
  AND r.name = 'agent';
