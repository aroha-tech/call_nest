-- Deprecate tenant-wide "team default" on call_scripts.
-- Personal default is only users.default_call_script_id (agents set via dialer preferences).
-- Run: mysql -u root -p call_nest < server/schema/migrations/033_call_scripts_clear_team_default.sql

UPDATE call_scripts SET is_default = 0 WHERE is_default = 1;
