# System Seeds

Core system data that must exist for the application to function.

## Files

| File | Description | Order |
|------|-------------|-------|
| `01_platform_tenant.sql` | Creates platform tenant (id=1) | First |

## Usage

```sql
-- From MySQL CLI
SOURCE D:/own_software/call_nest/server/schema/seeds/01_system/01_platform_tenant.sql;
```

## Notes

- Platform tenant (id=1) is reserved for super admin users
- Super admin user is created via the application (not SQL seed)
- Never delete or modify the platform tenant
