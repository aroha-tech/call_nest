-- Tenant defaults and per-user overrides for Exotel CLI / first-leg (shared-number setups).
-- Run: mysql -u root -p call_nest < server/schema/migrations/103_tenant_user_telephony_numbers.sql
-- Or: USE call_nest; source server/schema/migrations/103_tenant_user_telephony_numbers.sql;
--
-- Note: Split ADDs so AFTER can reference a column that already exists (some MySQL builds
-- reject AFTER pointing at a sibling added in the same multi-ADD ALTER).

ALTER TABLE tenants
  ADD COLUMN telephony_caller_id_e164 VARCHAR(32) NULL
    COMMENT 'Default ExoPhone / CLI for outbound (tenant-wide; optional vs env fallback)'
    AFTER dialer_workspace_config;

ALTER TABLE tenants
  ADD COLUMN telephony_agent_leg_e164 VARCHAR(32) NULL
    COMMENT 'Default first-leg number (softphone) for Exotel Connect; optional vs env fallback'
    AFTER telephony_caller_id_e164;

ALTER TABLE users
  ADD COLUMN telephony_caller_id_e164 VARCHAR(32) NULL
    COMMENT 'Override tenant default ExoPhone / CLI for this user'
    AFTER agent_can_delete_contacts;

ALTER TABLE users
  ADD COLUMN telephony_agent_leg_e164 VARCHAR(32) NULL
    COMMENT 'Override tenant default first-leg (agent phone) for this user'
    AFTER telephony_caller_id_e164;
