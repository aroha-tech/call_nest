-- Per-tenant: enable Advanced reports (AI insights, performance detail APIs). Default off.
-- Paste-ready for SQL editors; then run from project root:
--   mysql -u root -p call_nest < server/schema/migrations/101_tenant_reports_advanced_enabled.sql
-- Or: USE call_nest; SOURCE server/schema/migrations/101_tenant_reports_advanced_enabled.sql;

ALTER TABLE tenants
  ADD COLUMN reports_advanced_enabled TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = show advanced reports (AI insights, performance detail)';
