-- Add multiselect type for contact custom fields (import + forms).
-- Run after backups. Replace database name if needed.

USE call_nest;

ALTER TABLE contact_custom_fields
  MODIFY COLUMN type ENUM('text','number','date','boolean','select','multiselect') NOT NULL;
