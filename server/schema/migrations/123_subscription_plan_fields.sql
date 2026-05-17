-- Subscription fields on telephony_billing_plans (tenant_billing = main website plans).
--
-- Requires 120 (plan_category, billing_interval, pricing columns).
--
-- Paste-ready:
--   USE call_nest;
--   SOURCE server/schema/migrations/123_subscription_plan_fields.sql;
--
-- Shell:
--   mysql -u root -p call_nest < server/schema/migrations/123_subscription_plan_fields.sql

ALTER TABLE telephony_billing_plans
  ADD COLUMN subscription_tier ENUM('free', 'standard', 'enterprise', 'custom') NOT NULL DEFAULT 'standard'
    COMMENT 'free=trial; standard=paid catalog; enterprise=contact sales; custom=negotiated'
    AFTER plan_category;

ALTER TABLE telephony_billing_plans
  ADD COLUMN trial_duration_days INT UNSIGNED NULL
    COMMENT 'Free/trial length in days (free tier).'
    AFTER billing_interval;

ALTER TABLE telephony_billing_plans
  ADD COLUMN included_wallet_credit_paise BIGINT UNSIGNED NULL
    COMMENT 'Call wallet credit included with subscription (not top-up packs).'
    AFTER wallet_credit_paise;

ALTER TABLE telephony_billing_plans
  ADD COLUMN seat_limit_admins INT UNSIGNED NULL
    COMMENT 'Max admin seats included. NULL = unlimited / not enforced yet.'
    AFTER included_wallet_credit_paise;

ALTER TABLE telephony_billing_plans
  ADD COLUMN seat_limit_managers INT UNSIGNED NULL
    COMMENT 'Max manager seats included.'
    AFTER seat_limit_admins;

ALTER TABLE telephony_billing_plans
  ADD COLUMN seat_limit_users INT UNSIGNED NULL
    COMMENT 'Max user/agent seats included.'
    AFTER seat_limit_managers;

ALTER TABLE telephony_billing_plans
  ADD COLUMN features_html MEDIUMTEXT NULL
    COMMENT 'Rich HTML bullet list / marketing copy shown on pricing page.'
    AFTER seat_limit_users;

ALTER TABLE telephony_billing_plans
  ADD COLUMN features_json JSON NULL
    COMMENT 'Optional structured feature lines [{\"text\":\"...\"}] if HTML empty.'
    AFTER features_html;

ALTER TABLE telephony_billing_plans
  ADD COLUMN is_contact_sales TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = enterprise / custom quote (no self-serve checkout).'
    AFTER features_json;
