-- Default pipeline currency for new deals rows: INR (application also normalizes to INR when omitted).
-- Run: mysql -u root -p call_nest < server/schema/migrations/098_deals_currency_default_inr.sql
-- Or: USE call_nest; SOURCE server/schema/migrations/098_deals_currency_default_inr.sql;

ALTER TABLE deals MODIFY COLUMN currency_code VARCHAR(8) NOT NULL DEFAULT 'INR';
