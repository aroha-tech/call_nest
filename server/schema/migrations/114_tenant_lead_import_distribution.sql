-- Per-tenant JSON for lead CSV import auto-assignment (admin default pool + per-manager pools).
-- Run: mysql -u root -p call_nest < server/schema/migrations/114_tenant_lead_import_distribution.sql

ALTER TABLE tenants
  ADD COLUMN lead_import_distribution JSON NULL
    COMMENT 'Lead import pools: { default_pool:[{user_id,weight}], by_manager: { "<managerId>": [...] } }'
    AFTER dialer_workspace_config;
