-- Soft delete for email_accounts (always soft delete, never hard delete)
--
-- From project root:
--   mysql -u root -p call_nest < server/schema/migrations/016_email_accounts_soft_delete.sql
-- Or inside MySQL:
--   USE call_nest;
--   SOURCE server/schema/migrations/016_email_accounts_soft_delete.sql;

ALTER TABLE email_accounts
  ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = soft deleted',
  ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL;

CREATE INDEX idx_email_accounts_deleted
  ON email_accounts (tenant_id, is_deleted);
