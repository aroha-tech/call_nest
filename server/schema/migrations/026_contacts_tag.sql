-- Migration 026: optional tag on contacts/leads for segmentation and campaign filters.
-- Run: mysql -u root -p call_nest < server/schema/migrations/026_contacts_tag.sql

ALTER TABLE contacts
  ADD COLUMN tag VARCHAR(255) NULL AFTER source;

ALTER TABLE contacts
  ADD INDEX idx_contacts_tag (tenant_id, tag);
