-- Default contact profile / location columns (first-class on contacts, not custom fields)
-- Run once per database. Columns are appended at the end of the table (no AFTER — works on any column order).

ALTER TABLE contacts
  ADD COLUMN city VARCHAR(150) NULL,
  ADD COLUMN state VARCHAR(150) NULL,
  ADD COLUMN country VARCHAR(100) NULL,
  ADD COLUMN address VARCHAR(500) NULL,
  ADD COLUMN address_line_2 VARCHAR(255) NULL,
  ADD COLUMN pin_code VARCHAR(20) NULL,
  ADD COLUMN company VARCHAR(255) NULL,
  ADD COLUMN job_title VARCHAR(150) NULL,
  ADD COLUMN website VARCHAR(500) NULL,
  ADD COLUMN industry VARCHAR(150) NULL,
  ADD COLUMN date_of_birth DATE NULL,
  ADD COLUMN tax_id VARCHAR(50) NULL;
