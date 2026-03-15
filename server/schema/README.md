# Call Nest Database Schema

Complete database schema for the Call Nest CRM application.

## Folder Structure

```
schema/
├── 00_bootstrap.sql          # Database creation script
├── tenant/                   # Tenant table
│   └── tenant.sql
├── user/                     # User & auth tables
│   ├── user.sql
│   └── refresh_token.sql
├── rbac/                     # Role-Based Access Control tables
│   ├── permission.sql
│   ├── role.sql
│   └── role_permission.sql
├── disposition/              # Disposition module tables
│   ├── 01_industries.sql
│   ├── 02_dispo_types_master.sql
│   ├── 03_dispo_actions_master.sql
│   ├── 04_contact_status_master.sql
│   ├── 05_contact_temperature_master.sql
│   ├── 06_default_dispositions.sql
│   ├── 07_default_dialing_sets.sql
│   ├── 08_default_dialing_set_dispositions.sql
│   ├── 09_default_disposition_actions_map.sql
│   ├── 10_dialing_sets.sql
│   ├── 11_dispositions.sql
│   ├── 12_dialing_set_dispositions.sql
│   ├── 13_disposition_actions_map.sql
│   └── run_all.sql
├── seeds/                    # Seed data
│   ├── 01_system/            # System seeds (platform tenant)
│   ├── 02_rbac/              # RBAC seeds (permissions, roles)
│   ├── 03_master/            # Master data seeds
│   └── run_all_seeds.sql
└── migrations/               # Schema migrations
    ├── 001_tenant_industry.sql
    ├── 002_master_soft_delete.sql
    └── README.md
```

## Installation Order

### New Database Setup

```sql
-- 1. Create database
SOURCE D:/own_software/call_nest/server/schema/00_bootstrap.sql;
USE call_nest;

-- 2. Create tables (in order due to foreign keys)
SOURCE D:/own_software/call_nest/server/schema/tenant/tenant.sql;
SOURCE D:/own_software/call_nest/server/schema/user/user.sql;
SOURCE D:/own_software/call_nest/server/schema/user/refresh_token.sql;
SOURCE D:/own_software/call_nest/server/schema/rbac/permission.sql;
SOURCE D:/own_software/call_nest/server/schema/rbac/role.sql;
SOURCE D:/own_software/call_nest/server/schema/rbac/role_permission.sql;
SOURCE D:/own_software/call_nest/server/schema/disposition/run_all.sql;

-- 3. Seed data
SOURCE D:/own_software/call_nest/server/schema/seeds/run_all_seeds.sql;
```

### Upgrading Existing Database

```sql
-- Run applicable migrations
SOURCE D:/own_software/call_nest/server/schema/migrations/001_tenant_industry.sql;
SOURCE D:/own_software/call_nest/server/schema/migrations/002_master_soft_delete.sql;
```

## Table Summary

### Core Tables
| Table | Description |
|-------|-------------|
| `tenants` | Company/organization records |
| `users` | User accounts (all roles) |
| `refresh_tokens` | JWT refresh tokens |

### RBAC Tables
| Table | Description |
|-------|-------------|
| `permissions` | Permission codes |
| `roles` | Tenant-specific roles |
| `role_permissions` | Role-permission mappings |

### Master Tables (Global)
| Table | Description | Soft Delete |
|-------|-------------|-------------|
| `industries` | Industry definitions | ✓ |
| `dispo_types_master` | Disposition type categories | ✓ |
| `dispo_actions_master` | Disposition actions | ✓ |
| `contact_status_master` | Contact lifecycle stages | ✓ |
| `contact_temperature_master` | Lead temperature levels | ✓ |

### Default Templates (Global)
| Table | Description |
|-------|-------------|
| `default_dispositions` | Industry/global default dispositions |
| `default_dialing_sets` | Industry/global default dialing sets |
| `default_dialing_set_dispositions` | Default dialing set disposition mappings |
| `default_disposition_actions_map` | Default disposition action mappings |

### Tenant Tables
| Table | Description |
|-------|-------------|
| `dispositions` | Tenant-specific dispositions |
| `dialing_sets` | Tenant-specific dialing sets |
| `dialing_set_dispositions` | Tenant dialing set disposition mappings |
| `disposition_actions_map` | Tenant disposition action mappings |

## Multi-Tenancy

- All tenant-scoped tables have `tenant_id` column
- Platform tenant (id=1) reserved for super admin
- Super admin has no tenant_id (NULL)
- Application-level tenant isolation (not DB-level)

## Conventions

- **Primary Keys**: UUID (CHAR(36)) for master tables, BIGINT AUTO_INCREMENT for others
- **Soft Delete**: `is_deleted` (TINYINT) + `deleted_at` (TIMESTAMP)
- **Enable/Disable**: `is_active` (TINYINT) for master, `is_enabled` for tenants/users
- **Timestamps**: `created_at`, `updated_at` on all tables
- **Audit**: `created_by`, `updated_by` where applicable
