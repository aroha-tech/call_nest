-- Roles (TENANT LEVEL) — each tenant has its own set of roles
-- is_system_role = 1: system-defined roles (admin, manager, agent) — cannot be deleted
-- is_system_role = 0: custom roles created by tenant admin (future feature)
-- System roles are auto-created for each tenant during tenant registration

CREATE TABLE IF NOT EXISTS roles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  is_system_role TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uk_role_name_per_tenant (tenant_id, name),
  INDEX idx_roles_tenant (tenant_id),
  INDEX idx_roles_tenant_name (tenant_id, name),

  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
