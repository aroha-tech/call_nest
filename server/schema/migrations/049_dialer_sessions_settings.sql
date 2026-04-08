-- Store dialing set + call script chosen for a dialer session.
-- Run: mysql -u root -p call_nest < server/schema/migrations/049_dialer_sessions_settings.sql

ALTER TABLE dialer_sessions
  ADD COLUMN dialing_set_id CHAR(36) NULL,
  ADD COLUMN call_script_id BIGINT UNSIGNED NULL;

CREATE INDEX idx_ds_tenant_dialing_set ON dialer_sessions (tenant_id, dialing_set_id);
CREATE INDEX idx_ds_tenant_call_script ON dialer_sessions (tenant_id, call_script_id);

