-- Task Manager assignment enhancements:
-- - task type, priority, due preset
-- - reminder + reminder delivery tracking
-- - meeting association + repeat settings
-- - assignment comments history

USE call_nest;

ALTER TABLE task_assignments
  ADD COLUMN task_type ENUM('todo','meeting','call') NOT NULL DEFAULT 'todo' AFTER description;

ALTER TABLE task_assignments
  ADD COLUMN priority ENUM('low','medium','high') NOT NULL DEFAULT 'medium' AFTER task_type;

ALTER TABLE task_assignments
  ADD COLUMN due_preset VARCHAR(40) NULL AFTER priority;

ALTER TABLE task_assignments
  ADD COLUMN associated_meeting_id BIGINT UNSIGNED NULL AFTER due_preset;

ALTER TABLE task_assignments
  ADD COLUMN reminder_at DATETIME NULL AFTER associated_meeting_id;

ALTER TABLE task_assignments
  ADD COLUMN reminder_sent_at DATETIME NULL AFTER reminder_at;

ALTER TABLE task_assignments
  ADD COLUMN repeat_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER reminder_sent_at;

ALTER TABLE task_assignments
  ADD COLUMN repeat_interval_days INT UNSIGNED NULL AFTER repeat_enabled;

ALTER TABLE task_assignments
  ADD INDEX idx_task_assignments_tenant_type_priority (tenant_id, task_type, priority);

ALTER TABLE task_assignments
  ADD INDEX idx_task_assignments_tenant_reminder (tenant_id, reminder_at, reminder_sent_at);

CREATE TABLE IF NOT EXISTS task_assignment_comments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  assignment_id BIGINT UNSIGNED NOT NULL,
  comment_text TEXT NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_task_assignment_comments_tenant_assignment (tenant_id, assignment_id),
  KEY idx_task_assignment_comments_tenant_created (tenant_id, created_at),
  KEY idx_task_assignment_comments_tenant_deleted (tenant_id, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
