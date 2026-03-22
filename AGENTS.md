# Agent / contributor notes

- **DB audit fields**: New MySQL tables must include `created_by`, `updated_by`, `deleted_by`, `created_at`, `updated_at`, `deleted_at`, with list APIs excluding soft-deleted rows. See [.cursor/rules/database-audit-fields.mdc](.cursor/rules/database-audit-fields.mdc).
- **SQL migrations**: When documenting a migration, always give **(1)** paste-ready SQL for SQL editors and **(2)** the `mysql ... < file` and/or `source path` commands. See **Migrations** in [.cursor/rules/project-conventions.mdc](.cursor/rules/project-conventions.mdc).
