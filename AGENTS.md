# Agent / contributor notes

- **DB audit fields**: New MySQL tables must include `created_by`, `updated_by`, `deleted_by`, `created_at`, `updated_at`, `deleted_at`, with list APIs excluding soft-deleted rows. See [.cursor/rules/database-audit-fields.mdc](.cursor/rules/database-audit-fields.mdc).
