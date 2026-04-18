-- Allow background bulk-delete jobs to set deleted_source = 'bulk_job' (was missing from ENUM → MySQL "Data truncated").
-- Paste-ready:
--   USE call_nest;
--   ALTER TABLE contacts
--     MODIFY COLUMN deleted_source ENUM('manual','import','api','integration','bulk_job') NULL;
-- File run from project root:
--   mysql -u root -p call_nest < server/schema/migrations/066_contacts_deleted_source_bulk_job.sql
-- Or: source server/schema/migrations/066_contacts_deleted_source_bulk_job.sql

ALTER TABLE contacts
  MODIFY COLUMN deleted_source ENUM('manual','import','api','integration','bulk_job') NULL;
