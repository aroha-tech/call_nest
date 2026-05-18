-- GST / tax on telephony billing plan prices (India GST by default).
--
-- Paste-ready:
--   USE call_nest;
--   SOURCE server/schema/migrations/134_telephony_plan_gst.sql;

ALTER TABLE telephony_billing_plans
  ADD COLUMN gst_percent TINYINT UNSIGNED NULL DEFAULT 18
    COMMENT 'GST rate 0–100 applied at checkout. NULL treated as 18.',
  ADD COLUMN prices_include_gst TINYINT(1) NOT NULL DEFAULT 1
    COMMENT '1 = entered sale prices include GST; 0 = GST added on top at checkout';
