-- ============================================
-- Migration 099: Schedule hub — dedupe rows for follow-up reminder / overdue notifications
-- Paste-ready SQL for SQL editors:
--   USE call_nest;
--   SOURCE server/schema/migrations/099_scheduled_follow_up_reminder_events.sql;
--
-- File-based run from project root:
--   mysql -u root -p call_nest < server/schema/migrations/099_scheduled_follow_up_reminder_events.sql
--   -- or inside MySQL after USE call_nest;
--   source server/schema/migrations/099_scheduled_follow_up_reminder_events.sql
-- ============================================

CREATE TABLE IF NOT EXISTS scheduled_follow_up_reminder_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  scheduled_callback_id BIGINT UNSIGNED NOT NULL,
  assigned_user_id BIGINT UNSIGNED NOT NULL,
  kind ENUM('upcoming', 'overdue') NOT NULL DEFAULT 'upcoming',
  offset_minutes INT UNSIGNED NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sfure_callback_kind_offset (tenant_id, scheduled_callback_id, kind, offset_minutes),
  KEY idx_sfure_tenant_deleted (tenant_id, deleted_at),
  KEY idx_sfure_tenant_kind (tenant_id, kind, created_at),
  CONSTRAINT fk_sfure_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_sfure_callback FOREIGN KEY (scheduled_callback_id) REFERENCES scheduled_callbacks(id) ON DELETE CASCADE,
  CONSTRAINT fk_sfure_assignee FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
