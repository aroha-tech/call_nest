-- Allow rows with tenant_id NULL = platform inventory until super admin allocates to a client.
-- Run: mysql -u root -p call_nest < server/schema/migrations/105_tenant_dialer_phone_numbers_platform_inventory.sql

ALTER TABLE tenant_dialer_phone_numbers DROP FOREIGN KEY fk_tdpn_tenant;

ALTER TABLE tenant_dialer_phone_numbers
  MODIFY COLUMN tenant_id BIGINT UNSIGNED NULL
    COMMENT 'NULL = not allocated to a workspace yet (platform inventory)';

ALTER TABLE tenant_dialer_phone_numbers
  ADD CONSTRAINT fk_tdpn_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
