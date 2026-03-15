# Database Migrations

Schema migrations for upgrading existing Call Nest databases.

## Migrations (run in order)

| File | Description |
|------|-------------|
| `001_tenant_industry.sql` | Add industry support to tenants; nullable industry in default_dispositions / default_dialing_sets |
| `002_master_soft_delete.sql` | Add is_deleted, deleted_at to master tables (industries, dispo_types_master, dispo_actions_master, contact_status_master, contact_temperature_master) |
| `003_template_variables_sample_value.sql` | Add sample_value to template_variables |
| `004_call_scripts_is_default.sql` | Add is_default to call_scripts |
| `005_whatsapp_module.sql` | WhatsApp module: whatsapp_accounts, whatsapp_business_templates (with soft delete), whatsapp_template_components, whatsapp_messages, whatsapp_api_logs |
| `007_whatsapp_multi_provider.sql` | whatsapp_accounts: drop Meta-specific columns, add provider-agnostic fields; whatsapp_messages: add provider |
| `008_tenant_whatsapp_mode.sql` | Add whatsapp_send_mode to tenants |
| `009_whatsapp_module_flags.sql` | tenants: whatsapp_module_enabled; whatsapp_accounts: account_type; whatsapp_business_templates: template_mode |
| `010_whatsapp_automation_and_cooldown.sql` | tenants: whatsapp_automation_enabled; whatsapp_business_templates: cooldown_days, cooldown_hours; whatsapp_messages: send_mode |
| `011_email_module.sql` | Email module: tenants flag, email_accounts (with soft delete), email_templates, email_messages, email_attachments, email_events |
| `012_email_module_templates_table.sql` | email_module_templates (with soft delete) |
| `013_email_module_templates_account.sql` | Add email_account_id to email_module_templates |
| `014_whatsapp_business_templates_soft_delete.sql` | Add is_deleted, deleted_at to whatsapp_business_templates (skip if 005 was run with columns already in CREATE) |
| `015_email_module_templates_soft_delete.sql` | Add is_deleted, deleted_at to email_module_templates (skip if 012 was run with columns already in CREATE) |
| `016_email_accounts_soft_delete.sql` | Add is_deleted, deleted_at to email_accounts (skip if 011 was run with columns already in CREATE) |
| `017_whatsapp_accounts_soft_delete.sql` | Add is_deleted, deleted_at to whatsapp_accounts (skip if 005 was run with columns already in CREATE) |
| `018_tenant_email_module_flags.sql` | tenants: email_module_enabled (hide entire email module when 0), email_automation_enabled (future use) |

## Usage

```sql
-- From MySQL CLI (adjust path as needed)
USE call_nest;

SOURCE D:/own_software/call_nest/server/schema/migrations/001_tenant_industry.sql;
SOURCE D:/own_software/call_nest/server/schema/migrations/002_master_soft_delete.sql;
-- ... run others in order as needed for your upgrade path
```

From project root (single file):

```bash
mysql -u root -p call_nest < server/schema/migrations/014_whatsapp_business_templates_soft_delete.sql
```

## When to Use Migrations

**New installation (migration-based)**: Run 001, 002, then 005 (or 011/012 for email). Tables created in 005, 011, 012 now include `is_deleted` and `deleted_at`; for those setups you can skip 014–017.

**Existing database**: Run migrations in order to add new features. Run 014–017 to add soft-delete columns to WhatsApp/email tables if they were created before those columns were added to the CREATE statements.

## Notes

- Always backup your database before running migrations.
- If a migration fails with "Duplicate column" for is_deleted/deleted_at, the table already has those columns (e.g. from an updated 005/011/012); skip that migration.
