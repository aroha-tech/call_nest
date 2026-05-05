-- Per-tenant optional dial workspace features (JSON). NULL = use application defaults.
-- Run: mysql -u root -p call_nest < server/schema/migrations/091_tenant_dialer_workspace_config.sql

ALTER TABLE tenants
  ADD COLUMN dialer_workspace_config JSON NULL
    COMMENT 'Dial workspace feature flags (show_activity_tab, show_email_tab, show_website_tab, allow_edit_contact_in_session)'
    AFTER industry_id;
