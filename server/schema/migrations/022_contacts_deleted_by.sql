ALTER TABLE contacts
  ADD COLUMN deleted_by BIGINT UNSIGNED NULL;

ALTER TABLE contacts
  ADD COLUMN deleted_source ENUM('manual','import','api','integration') NULL;

ALTER TABLE contacts
  ADD CONSTRAINT fk_contacts_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL;

-- Migration 022: contacts soft-delete audit (deleted_by, deleted_source).
-- If "Duplicate column", skip that ALTER. If FK exists, skip last line.
