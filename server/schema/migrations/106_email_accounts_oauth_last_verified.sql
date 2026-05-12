-- Email accounts: last time OAuth was confirmed working (verify action or successful OAuth send).
--
-- Paste-ready (adjust database name):
-- USE call_nest;
-- ALTER TABLE email_accounts
--   ADD COLUMN oauth_last_verified_at TIMESTAMP NULL DEFAULT NULL
--   COMMENT 'Set when user runs Verify or after a successful Gmail/Outlook send'
--   AFTER token_expires_at;

ALTER TABLE email_accounts
  ADD COLUMN oauth_last_verified_at TIMESTAMP NULL DEFAULT NULL
  COMMENT 'Set when user runs Verify or after a successful Gmail/Outlook send'
  AFTER token_expires_at;

-- From project root:
--   mysql -u root -p call_nest < server/schema/migrations/106_email_accounts_oauth_last_verified.sql
-- Inside MySQL:
--   USE call_nest;
--   SOURCE server/schema/migrations/106_email_accounts_oauth_last_verified.sql;
