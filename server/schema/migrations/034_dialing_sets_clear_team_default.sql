-- Deprecate tenant-wide "team default" on dialing_sets.
-- Personal default is only users.default_dialing_set_id (agents set via dialer preferences).
-- Run: mysql -u root -p call_nest < server/schema/migrations/034_dialing_sets_clear_team_default.sql

UPDATE dialing_sets SET is_default = 0 WHERE is_default = 1;
