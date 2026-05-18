-- Three commercial products: subscription (tenant_billing), credit top-up (one-time), seat add-ons.
--
-- Paste-ready:
--   USE call_nest;
--   SOURCE server/schema/migrations/132_telephony_three_product_types.sql;

ALTER TABLE telephony_billing_plans
  MODIFY COLUMN plan_category ENUM('tenant_billing', 'credit_purchase', 'seat_purchase') NOT NULL
    DEFAULT 'tenant_billing'
    COMMENT 'tenant_billing=CRM+telephony bundle; credit_purchase=wallet top-up; seat_purchase=per seat/channel add-on';

ALTER TABLE telephony_billing_plans
  CHANGE COLUMN seat_limit_users seat_limit_agents INT UNSIGNED NULL
    COMMENT 'Max agent seats included in subscription (NULL = not capped on plan).';

ALTER TABLE telephony_billing_plans
  ADD COLUMN seat_limit_channels INT UNSIGNED NULL
    COMMENT 'Unlimited-calling channel seats included in subscription bundle.'
    AFTER seat_limit_agents;

ALTER TABLE telephony_billing_plans
  ADD COLUMN seat_role ENUM('admin', 'manager', 'agent') NULL
    COMMENT 'Seat add-on role (seat_purchase only).'
    AFTER seat_limit_channels;

ALTER TABLE telephony_billing_plans
  ADD COLUMN includes_unlimited_channels TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = seat add-on includes unlimited calling channel.'
    AFTER seat_role;

-- Credit top-ups are one-time wallet packs only (no monthly/yearly SKUs).
UPDATE telephony_billing_plans
SET billing_interval = 'one_time'
WHERE plan_category = 'credit_purchase'
  AND deleted_at IS NULL
  AND (billing_interval IS NULL OR billing_interval IN ('month', 'year'));
