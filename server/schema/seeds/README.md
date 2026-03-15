# Database Seeds

Seed data for initializing the Call Nest database.

## Folder Structure

```
seeds/
├── 01_system/           # Core system data
│   └── 01_platform_tenant.sql
├── 02_rbac/             # Role-Based Access Control
│   ├── 01_permissions.sql
│   ├── 02_system_roles.sql
│   └── 03_role_permissions.sql
├── 03_master/           # Master reference data
│   ├── 01_industries.sql
│   ├── 02_dispo_types.sql
│   ├── 03_dispo_actions.sql
│   ├── 04_contact_statuses.sql
│   └── 05_contact_temperatures.sql
└── run_all_seeds.sql    # Master runner script
```

## Quick Start

### Run All Seeds

```sql
-- From MySQL CLI
SOURCE D:/own_software/call_nest/server/schema/seeds/run_all_seeds.sql;
```

### Run Individual Categories

```sql
-- System only
SOURCE D:/own_software/call_nest/server/schema/seeds/01_system/01_platform_tenant.sql;

-- RBAC only
SOURCE D:/own_software/call_nest/server/schema/seeds/02_rbac/01_permissions.sql;
SOURCE D:/own_software/call_nest/server/schema/seeds/02_rbac/02_system_roles.sql;
SOURCE D:/own_software/call_nest/server/schema/seeds/02_rbac/03_role_permissions.sql;

-- Master data only
SOURCE D:/own_software/call_nest/server/schema/seeds/03_master/01_industries.sql;
SOURCE D:/own_software/call_nest/server/schema/seeds/03_master/02_dispo_types.sql;
SOURCE D:/own_software/call_nest/server/schema/seeds/03_master/03_dispo_actions.sql;
SOURCE D:/own_software/call_nest/server/schema/seeds/03_master/04_contact_statuses.sql;
SOURCE D:/own_software/call_nest/server/schema/seeds/03_master/05_contact_temperatures.sql;
```

## Seed Categories

### 01. System Seeds
Core system data required for application to function.

| File | Description |
|------|-------------|
| `01_platform_tenant.sql` | Platform tenant (id=1) for super admin |

### 02. RBAC Seeds
Role-Based Access Control definitions.

| File | Description |
|------|-------------|
| `01_permissions.sql` | 14 permission codes |
| `02_system_roles.sql` | admin, manager, agent roles |
| `03_role_permissions.sql` | Role-permission mappings |

### 03. Master Data Seeds
Platform-wide reference data managed by Super Admin.

| File | Description | Records |
|------|-------------|---------|
| `01_industries.sql` | Industry definitions | 25 |
| `02_dispo_types.sql` | Disposition types | 10 |
| `03_dispo_actions.sql` | Disposition actions | 12 |
| `04_contact_statuses.sql` | Contact statuses | 11 |
| `05_contact_temperatures.sql` | Temperature levels | 4 |

## Execution Order

Seeds must be run in the correct order due to foreign key dependencies:

1. **Tables** - All tables must be created first
2. **System** - Platform tenant (no dependencies)
3. **RBAC** - Permissions → Roles → Role-Permissions
4. **Master** - Industries → Other master data

## Notes

- All seeds are idempotent (safe to re-run)
- Use `INSERT IGNORE` or `ON DUPLICATE KEY UPDATE` for safety
- Master data uses UUID for primary keys
- Super admin user is created via the application, not seeds

## Troubleshooting

### Foreign Key Errors
```sql
SET FOREIGN_KEY_CHECKS = 0;
-- run your seeds
SET FOREIGN_KEY_CHECKS = 1;
```

### Duplicate Entry Errors
Seeds use `INSERT IGNORE` or `ON DUPLICATE KEY UPDATE` - re-running is safe.

### Path Issues (Windows)
Use forward slashes in paths: `D:/own_software/call_nest/...`
