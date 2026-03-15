-- WhatsApp multi-provider support
-- 1. whatsapp_accounts: generic credential fields (provider-agnostic)
-- 2. whatsapp_messages: add provider column for debugging/analytics
--
-- Run: mysql -u root -p call_nest < server/schema/migrations/007_whatsapp_multi_provider.sql

-- ========== whatsapp_accounts ==========
-- Remove Meta-specific columns (run once; omit if already applied)
ALTER TABLE whatsapp_accounts
  DROP COLUMN phone_number_id,
  DROP COLUMN business_account_id,
  DROP COLUMN access_token;

-- Add provider-agnostic fields (use ADD COLUMN IF NOT EXISTS where supported, else separate checks)
ALTER TABLE whatsapp_accounts
  ADD COLUMN account_name VARCHAR(100) NULL AFTER provider,
  ADD COLUMN external_account_id VARCHAR(150) NULL AFTER phone_number,
  ADD COLUMN api_key TEXT NULL AFTER external_account_id,
  ADD COLUMN api_secret TEXT NULL AFTER api_key,
  ADD COLUMN webhook_url VARCHAR(255) NULL AFTER api_secret;

-- ========== whatsapp_messages ==========
ALTER TABLE whatsapp_messages
  ADD COLUMN provider VARCHAR(50) NULL AFTER tenant_id;
