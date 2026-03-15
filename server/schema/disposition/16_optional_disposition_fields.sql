-- Make contact_status_id and contact_temperature_id optional for tenant dispositions
-- Only name, code, and dispo_type_id are required

ALTER TABLE dispositions
  MODIFY COLUMN contact_status_id CHAR(36) NULL,
  MODIFY COLUMN contact_temperature_id CHAR(36) NULL;
