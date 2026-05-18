-- Add subscription_included to call credit ledger entry types (plan included wallet grants).
--
-- Paste-ready (SQL editor):
--   USE call_nest;
--   ALTER TABLE tenant_call_credit_ledger
--     MODIFY COLUMN entry_type ENUM(
--       'topup',
--       'debit_call',
--       'adjustment_credit',
--       'adjustment_debit',
--       'refund',
--       'subscription_included'
--     ) NOT NULL;
--
-- File-based run from project root:
--   mysql -u root -p call_nest < server/schema/migrations/135_ledger_subscription_included_entry_type.sql

ALTER TABLE tenant_call_credit_ledger
  MODIFY COLUMN entry_type ENUM(
    'topup',
    'debit_call',
    'adjustment_credit',
    'adjustment_debit',
    'refund',
    'subscription_included'
  ) NOT NULL;
