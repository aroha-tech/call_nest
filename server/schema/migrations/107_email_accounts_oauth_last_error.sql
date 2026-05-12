-- Email OAuth: last provider/auth failure (drives Email Accounts UI until cleared by success or reconnect).
--
-- Paste-ready:
-- USE call_nest;
-- ALTER TABLE email_accounts
--   ADD COLUMN oauth_last_error_at TIMESTAMP NULL DEFAULT NULL AFTER oauth_last_verified_at,
--   ADD COLUMN oauth_last_error_code VARCHAR(64) NULL DEFAULT NULL COMMENT 'Stable code e.g. OAUTH_GMAIL_REFRESH_FAILED',
--   ADD COLUMN oauth_last_error_detail VARCHAR(512) NULL DEFAULT NULL COMMENT 'Short single-line message for UI';

ALTER TABLE email_accounts
  ADD COLUMN oauth_last_error_at TIMESTAMP NULL DEFAULT NULL AFTER oauth_last_verified_at,
  ADD COLUMN oauth_last_error_code VARCHAR(64) NULL DEFAULT NULL COMMENT 'Stable code e.g. OAUTH_GMAIL_REFRESH_FAILED',
  ADD COLUMN oauth_last_error_detail VARCHAR(512) NULL DEFAULT NULL COMMENT 'Short single-line message for UI';

-- From project root:
--   mysql -u root -p call_nest < server/schema/migrations/107_email_accounts_oauth_last_error.sql
-- Inside MySQL:
--   USE call_nest;
--   SOURCE server/schema/migrations/107_email_accounts_oauth_last_error.sql;
