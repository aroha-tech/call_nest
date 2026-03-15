# Disposition Schema

All disposition-related schema and migrations live here so disposition data is easy to track.

## Execution Order

Run files in numbered order due to foreign key dependencies:

### Super Admin Tables (Global/Platform-Level)

1. `01_industries.sql` - Industry definitions
2. `02_dispo_types_master.sql` - Disposition type categories (positive, negative, neutral, etc.)
3. `03_dispo_actions_master.sql` - Action definitions (schedule_callback, send_email, etc.)
4. `04_contact_status_master.sql` - Contact status definitions (new, contacted, qualified, etc.)
5. `05_contact_temperature_master.sql` - Contact temperature definitions (hot, warm, cold, etc.)
6. `06_default_dispositions.sql` - Industry-specific disposition templates
7. `07_default_dialing_sets.sql` - Industry-specific dialing set templates
8. `08_default_dialing_set_dispositions.sql` - Maps dispositions to dialing sets (defaults)
9. `09_default_disposition_actions_map.sql` - Maps actions to dispositions (defaults)

### Tenant Tables (Tenant-Scoped)

10. `10_dialing_sets.sql` - Tenant dialing sets (can be created from defaults)
11. `11_dispositions.sql` - Tenant dispositions (can be created from defaults)
12. `12_dialing_set_dispositions.sql` - Maps tenant dispositions to dialing sets
13. `13_disposition_actions_map.sql` - Maps actions to tenant dispositions

## Table Relationships

### Global (Super Admin) Tables

```
industries
    │
    ├──< default_dispositions >──┬── dispo_types_master
    │           │                ├── contact_status_master
    │           │                └── contact_temperature_master
    │           │
    │           ├──< default_dialing_set_dispositions
    │           │
    │           └──< default_disposition_actions_map >── dispo_actions_master
    │
    └──< default_dialing_sets >──< default_dialing_set_dispositions
```

### Tenant Tables

```
tenants
    │
    ├──< dialing_sets ─────────────────────< dialing_set_dispositions
    │       └── (created_from_default_id) ──> default_dialing_sets
    │
    └──< dispositions >──┬── dispo_types_master (global)
            │            ├── contact_status_master (global)
            │            ├── contact_temperature_master (global)
            │            └── (created_from_default_id) ──> default_dispositions
            │
            ├──< dialing_set_dispositions
            │
            └──< disposition_actions_map >── dispo_actions_master (global)
```

## Key Design Decisions

### Primary Keys
- All tables use `CHAR(36)` for UUID-based primary keys

### No ENUMs
- All categorical values stored as lookup tables with foreign keys

### Multi-Tenancy
- Tenant tables include `tenant_id BIGINT UNSIGNED NOT NULL`
- Composite indexes on `(tenant_id, id)` for query performance
- Foreign key cascade: `ON DELETE CASCADE` for tenant reference

### Soft Deletes (Tenant Tables Only)
- `is_deleted TINYINT(1) NOT NULL DEFAULT 0`
- `deleted_at TIMESTAMP NULL DEFAULT NULL`
- Global master tables use `is_active` flag instead

### Template System
- `created_from_default_id` tracks which default template was used
- `is_system_generated` marks auto-created records during tenant setup

### Service Layer Business Rules
- **Max 3 actions per disposition** - enforced at service layer, NOT DB level
- **Only one is_default dialing set per tenant** - enforced at service layer

### Unique Constraints

| Table | Constraint |
|-------|------------|
| `industries` | `code` (globally unique) |
| `dispo_types_master` | `code` (globally unique) |
| `dispo_actions_master` | `code` (globally unique) |
| `contact_status_master` | `code` (globally unique) |
| `contact_temperature_master` | `code` (globally unique) |
| `default_dispositions` | `(industry_id, code)` |
| `default_dialing_set_dispositions` | `(default_dialing_set_id, default_disposition_id)` |
| `default_disposition_actions_map` | `(default_disposition_id, action_id)` |
| `dispositions` | `(tenant_id, code)` |
| `dialing_set_dispositions` | `(dialing_set_id, disposition_id)` |
| `disposition_actions_map` | `(disposition_id, action_id)` |

### Foreign Key Actions

| Reference Type | ON DELETE |
|---------------|-----------|
| Tenant reference | CASCADE |
| Master table reference | RESTRICT |
| Mapping table reference | CASCADE |
| User reference (created_by/updated_by) | SET NULL |
| Default template reference | SET NULL |
