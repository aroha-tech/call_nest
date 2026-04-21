-- Task manager + role-wise performance reports
-- Includes templates, assignments, daily logs, notes history, scoring config, and alert backlog.

CREATE TABLE IF NOT EXISTS task_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(180) NOT NULL,
  description TEXT NULL,
  target_calls INT UNSIGNED NOT NULL DEFAULT 0,
  target_meetings INT UNSIGNED NOT NULL DEFAULT 0,
  target_deals INT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_task_templates_tenant_active (tenant_id, is_active),
  KEY idx_task_templates_tenant_name (tenant_id, name),
  KEY idx_task_templates_tenant_deleted (tenant_id, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS task_assignments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  template_id BIGINT UNSIGNED NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  assigned_to_user_id BIGINT UNSIGNED NOT NULL,
  assigned_by_user_id BIGINT UNSIGNED NOT NULL,
  schedule_type ENUM('one_time','date_range','recurring') NOT NULL DEFAULT 'one_time',
  recurring_pattern JSON NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  target_calls INT UNSIGNED NOT NULL DEFAULT 0,
  target_meetings INT UNSIGNED NOT NULL DEFAULT 0,
  target_deals INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('active','paused','completed','cancelled') NOT NULL DEFAULT 'active',
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_task_assignments_tenant_user_dates (tenant_id, assigned_to_user_id, start_date, end_date),
  KEY idx_task_assignments_tenant_status (tenant_id, status),
  KEY idx_task_assignments_tenant_template (tenant_id, template_id),
  KEY idx_task_assignments_tenant_deleted (tenant_id, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS daily_task_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  assignment_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  task_date DATE NOT NULL,
  target_calls INT UNSIGNED NOT NULL DEFAULT 0,
  target_meetings INT UNSIGNED NOT NULL DEFAULT 0,
  target_deals INT UNSIGNED NOT NULL DEFAULT 0,
  achieved_calls INT UNSIGNED NOT NULL DEFAULT 0,
  achieved_meetings INT UNSIGNED NOT NULL DEFAULT 0,
  achieved_deals INT UNSIGNED NOT NULL DEFAULT 0,
  completion_percent DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  score DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  status ENUM('pending','in_progress','achieved','missed','no_task') NOT NULL DEFAULT 'pending',
  agent_note TEXT NULL,
  manager_note TEXT NULL,
  excluded_reason VARCHAR(200) NULL,
  is_locked TINYINT(1) NOT NULL DEFAULT 0,
  locked_at DATETIME NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_daily_task_logs_tenant_assignment_user_date (tenant_id, assignment_id, user_id, task_date),
  KEY idx_daily_task_logs_tenant_user_date (tenant_id, user_id, task_date),
  KEY idx_daily_task_logs_tenant_status_date (tenant_id, status, task_date),
  KEY idx_daily_task_logs_tenant_deleted (tenant_id, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS task_note_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  daily_task_log_id BIGINT UNSIGNED NOT NULL,
  note_type ENUM('agent','manager','system') NOT NULL,
  note_text TEXT NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_task_note_history_tenant_log (tenant_id, daily_task_log_id),
  KEY idx_task_note_history_tenant_type_created (tenant_id, note_type, created_at),
  KEY idx_task_note_history_tenant_deleted (tenant_id, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS task_scoring_config (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  calls_weight DECIMAL(5,2) NOT NULL DEFAULT 30.00,
  meetings_weight DECIMAL(5,2) NOT NULL DEFAULT 30.00,
  deals_weight DECIMAL(5,2) NOT NULL DEFAULT 40.00,
  low_performance_threshold DECIMAL(5,2) NOT NULL DEFAULT 50.00,
  medium_performance_threshold DECIMAL(5,2) NOT NULL DEFAULT 75.00,
  coaching_missed_days_threshold INT UNSIGNED NOT NULL DEFAULT 3,
  coaching_consistency_threshold DECIMAL(5,2) NOT NULL DEFAULT 60.00,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_task_scoring_config_tenant (tenant_id),
  KEY idx_task_scoring_config_tenant_deleted (tenant_id, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS task_alert_backlog (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  related_log_id BIGINT UNSIGNED NULL,
  alert_type VARCHAR(80) NOT NULL,
  alert_title VARCHAR(180) NOT NULL,
  alert_message TEXT NOT NULL,
  alert_date DATE NOT NULL,
  status ENUM('queued','dismissed','processed') NOT NULL DEFAULT 'queued',
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_task_alert_backlog_tenant_user_date (tenant_id, user_id, alert_date),
  KEY idx_task_alert_backlog_tenant_status (tenant_id, status),
  KEY idx_task_alert_backlog_tenant_deleted (tenant_id, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO task_scoring_config (
  tenant_id,
  calls_weight,
  meetings_weight,
  deals_weight,
  low_performance_threshold,
  medium_performance_threshold,
  coaching_missed_days_threshold,
  coaching_consistency_threshold,
  created_by,
  updated_by
)
SELECT
  t.id,
  30.00,
  30.00,
  40.00,
  50.00,
  75.00,
  3,
  60.00,
  NULL,
  NULL
FROM tenants t
LEFT JOIN task_scoring_config cfg
  ON cfg.tenant_id = t.id
 AND cfg.deleted_at IS NULL
WHERE t.is_deleted = 0
  AND cfg.id IS NULL;
