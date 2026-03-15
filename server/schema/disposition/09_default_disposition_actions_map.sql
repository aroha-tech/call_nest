-- Default Disposition Actions Map (GLOBAL) — maps actions to dispositions
-- Super admin manages these; defines which actions are triggered by which disposition
-- priority_order determines execution order (lower = executes first)
-- Max 3 actions per disposition enforced at service layer (NOT DB level)

CREATE TABLE IF NOT EXISTS default_disposition_actions_map (
  id CHAR(36) PRIMARY KEY,
  default_disposition_id CHAR(36) NOT NULL,
  action_id CHAR(36) NOT NULL,
  priority_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (default_disposition_id) REFERENCES default_dispositions(id) ON DELETE CASCADE,
  FOREIGN KEY (action_id) REFERENCES dispo_actions_master(id) ON DELETE CASCADE,

  UNIQUE KEY uk_disposition_action (default_disposition_id, action_id),

  INDEX idx_disposition_actions_disposition (default_disposition_id),
  INDEX idx_disposition_actions_action (action_id),
  INDEX idx_disposition_actions_priority (default_disposition_id, priority_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
