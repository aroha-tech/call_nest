-- Purchased / registered Exotel numbers per tenant; optional assignment to one agent.
-- Run: mysql -u root -p call_nest < server/schema/migrations/104_tenant_dialer_phone_numbers.sql
-- Or: USE call_nest; source server/schema/migrations/104_tenant_dialer_phone_numbers.sql;

CREATE TABLE IF NOT EXISTS tenant_dialer_phone_numbers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  label VARCHAR(128) NULL,
  caller_id_e164 VARCHAR(32) NOT NULL COMMENT 'ExoPhone / CLI shown to customer',
  agent_leg_e164 VARCHAR(32) NULL COMMENT 'First leg (softphone); NULL = use tenant/env default for leg only',
  assigned_user_id BIGINT UNSIGNED NULL COMMENT 'Agent using this number; NULL = pool / unassigned',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_tdpn_tenant_deleted (tenant_id, deleted_at),
  KEY idx_tdpn_tenant_assignee (tenant_id, assigned_user_id, deleted_at),
  CONSTRAINT fk_tdpn_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_tdpn_user FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tdpn_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tdpn_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tdpn_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
