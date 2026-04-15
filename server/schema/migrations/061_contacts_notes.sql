-- Persistent contact/lead notes (separate from per-call notes on contact_call_attempts).
-- Run: mysql -u root -p call_nest < server/schema/migrations/061_contacts_notes.sql

ALTER TABLE contacts
  ADD COLUMN notes TEXT NULL
 COMMENT 'Contact-level notes; call-specific notes live on contact_call_attempts.notes'
    AFTER tax_id;
