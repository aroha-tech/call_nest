# RBAC Seeds

Role-Based Access Control seed data for permissions and roles.

## Files

| File | Description | Order |
|------|-------------|-------|
| `01_permissions.sql` | Platform-wide permission definitions | First |
| `02_system_roles.sql` | System roles for each tenant | Second |
| `03_role_permissions.sql` | Role-permission mappings | Third |

## Usage

```sql
-- Run in order from MySQL CLI
SOURCE D:/own_software/call_nest/server/schema/seeds/02_rbac/01_permissions.sql;
SOURCE D:/own_software/call_nest/server/schema/seeds/02_rbac/02_system_roles.sql;
SOURCE D:/own_software/call_nest/server/schema/seeds/02_rbac/03_role_permissions.sql;
```

## Role Permissions Summary

| Role | Permissions |
|------|-------------|
| **Admin** | All permissions (dashboard, contacts, leads, dial, reports, users, pipelines, settings, dispositions, telephony) |
| **Manager** | Dashboard, contacts (read), leads (read/update), dial monitor, reports |
| **Agent** | Dashboard, contacts (read), leads (read/update), dial execute |

## Notes

- Safe to re-run (uses INSERT IGNORE)
- System roles are created per tenant automatically
- Platform tenant (id=1) does not get tenant roles
