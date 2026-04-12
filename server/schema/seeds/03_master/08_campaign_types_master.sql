-- ============================================
-- SEED: Campaign Types Master (platform-wide)
-- CRM-style audience / channel for campaigns (separate from dialer active/paused).
-- Requires migration 054 applied.
-- ============================================

INSERT INTO campaign_types_master (id, code, name) VALUES
(UUID(), 'outbound', 'Outbound calling'),
(UUID(), 'inbound', 'Inbound / callbacks'),
(UUID(), 'email', 'Email'),
(UUID(), 'sms', 'SMS / messaging'),
(UUID(), 'web', 'Web & digital'),
(UUID(), 'event', 'Events & webinars'),
(UUID(), 'referral', 'Referral'),
(UUID(), 'partner', 'Partner channel'),
(UUID(), 'social', 'Social media'),
(UUID(), 'list_import', 'List import'),
(UUID(), 'other', 'Other');

SELECT CONCAT('Inserted ', ROW_COUNT(), ' campaign types') AS status;
