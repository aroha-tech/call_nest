# RBAC (Role-Based Access Control) Migration

This folder contains the database schema and migration files for upgrading from ENUM-based roles to a scalable Role-Permission architecture.

## Migration Order

Run these SQL files in order:

```bash
# 1. Create new tables
mysql -u root -p call_nest < server/schema/rbac/permission.sql
mysql -u root -p call_nest < server/schema/rbac/role.sql
mysql -u root -p call_nest < server/schema/rbac/role_permission.sql

# 2. Alter users table (adds role_id, token_version)
mysql -u root -p call_nest < server/schema/user/user_migration_rbac.sql

# 3. Seed permissions (global)
mysql -u root -p call_nest < server/schema/rbac/03_seed_permissions.sql

# 4. Seed system roles for all tenants
mysql -u root -p call_nest < server/schema/rbac/04_seed_system_roles.sql

# 5. Map permissions to roles
mysql -u root -p call_nest < server/schema/rbac/05_seed_role_permissions.sql

# 6. Migrate existing users to role_id
mysql -u root -p call_nest < server/schema/rbac/06_migrate_existing_users.sql
```

## Files Overview

| File | Purpose |
|------|---------|
| `permission.sql` | Global permissions table |
| `role.sql` | Tenant-scoped roles table |
| `role_permission.sql` | Junction table for role-permission mapping |
| `user_migration_rbac.sql` | ALTER statements for users table |
| `03_seed_permissions.sql` | Seed global permission codes |
| `04_seed_system_roles.sql` | Create admin/manager/agent roles per tenant |
| `05_seed_role_permissions.sql` | Map permissions to system roles |
| `06_migrate_existing_users.sql` | Update existing users with role_id |

## Backward Compatibility

- The ENUM `role` column in users table is **preserved**
- Application layer uses `role_id` for authorization decisions
- ENUM `role` can be deprecated in a future release after full migration verification

## Production Safety

- All migrations use `IF NOT EXISTS` / `INSERT IGNORE` patterns
- No data is dropped or deleted
- Foreign key constraints use `ON DELETE CASCADE` / `ON DELETE SET NULL` appropriately
- All operations are idempotent (safe to re-run)
