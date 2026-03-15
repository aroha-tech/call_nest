-- Disposition Actions Map (TENANT LEVEL) — maps actions to tenant dispositions
-- Defines which actions are triggered by which disposition for a tenant
-- priority_order determines execution order (lower = executes first)
-- email_template_id / whatsapp_template_id: required for send_email/send_whatsapp actions
-- Max 3 actions per disposition enforced at service layer (NOT DB level)

CREATE TABLE IF NOT EXISTS disposition_actions_map (
  id CHAR(36) PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  disposition_id CHAR(36) NOT NULL,
  action_id CHAR(36) NOT NULL,
  priority_order INT NOT NULL DEFAULT 0,
  email_template_id CHAR(36) NULL,
  whatsapp_template_id CHAR(36) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (disposition_id) REFERENCES dispositions(id) ON DELETE CASCADE,
  FOREIGN KEY (action_id) REFERENCES dispo_actions_master(id) ON DELETE CASCADE,
  FOREIGN KEY (email_template_id) REFERENCES email_templates(id) ON DELETE SET NULL,
  FOREIGN KEY (whatsapp_template_id) REFERENCES whatsapp_templates(id) ON DELETE SET NULL,

  UNIQUE KEY uk_disposition_action (disposition_id, action_id),

  INDEX idx_disposition_actions_tenant (tenant_id),
  INDEX idx_disposition_actions_disposition (disposition_id),
  INDEX idx_disposition_actions_action (action_id),
  INDEX idx_disposition_actions_priority (disposition_id, priority_order),
  INDEX idx_disposition_actions_email_template (email_template_id),
  INDEX idx_disposition_actions_whatsapp_template (whatsapp_template_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
