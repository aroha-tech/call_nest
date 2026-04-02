-- Per-user default dialing set and call script (agent preferences; not tenant-wide defaults)
-- dialing_sets.id is CHAR(36) UUID; call_scripts.id is BIGINT UNSIGNED — types must match for FKs.
-- Run: mysql -u root -p call_nest < server/schema/migrations/032_user_dialer_defaults.sql

ALTER TABLE users
  ADD COLUMN default_dialing_set_id CHAR(36) NULL DEFAULT NULL
    COMMENT 'User preferred dialing set (UUID = dialing_sets.id)'
    AFTER manager_id;

ALTER TABLE users
  ADD COLUMN default_call_script_id BIGINT UNSIGNED NULL DEFAULT NULL
    COMMENT 'User preferred call script'
    AFTER default_dialing_set_id;

ALTER TABLE users
  ADD CONSTRAINT fk_users_default_dialing_set
    FOREIGN KEY (default_dialing_set_id) REFERENCES dialing_sets(id) ON DELETE SET NULL;

ALTER TABLE users
  ADD CONSTRAINT fk_users_default_call_script
    FOREIGN KEY (default_call_script_id) REFERENCES call_scripts(id) ON DELETE SET NULL;
