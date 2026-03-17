-- Add password_changed_at column to users for password rotation tracking
--
-- From project root:
--   mysql -u root -p call_nest < server/schema/migrations/019_users_password_changed_at.sql
-- Or inside MySQL:
--   USE call_nest;
--   SOURCE D:/own_software/call_nest/server/schema/migrations/019_users_password_changed_at.sql;

ALTER TABLE users
  ADD COLUMN password_changed_at TIMESTAMP NULL DEFAULT NULL
  AFTER account_locked_until;

