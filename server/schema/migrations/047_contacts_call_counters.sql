-- Summary/cached call counters for fast lead "freshness" filtering.
-- Run: mysql -u root -p call_nest < server/schema/migrations/047_contacts_call_counters.sql

ALTER TABLE contacts
  ADD COLUMN first_called_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at,
  ADD COLUMN last_called_at TIMESTAMP NULL DEFAULT NULL AFTER first_called_at,
  ADD COLUMN call_count_total INT UNSIGNED NOT NULL DEFAULT 0 AFTER last_called_at;

ALTER TABLE contact_phones
  ADD COLUMN last_called_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at,
  ADD COLUMN call_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER last_called_at;

CREATE INDEX idx_contacts_tenant_last_called ON contacts (tenant_id, last_called_at);
CREATE INDEX idx_contacts_tenant_call_count ON contacts (tenant_id, call_count_total);
CREATE INDEX idx_contact_phones_tenant_last_called ON contact_phones (tenant_id, last_called_at);

