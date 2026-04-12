-- ============================================
-- SEED: Campaign Statuses Master (platform-wide)
-- CRM-style lifecycle for campaigns (separate from dialer availability).
-- Requires migration 054 applied.
-- ============================================

INSERT INTO campaign_statuses_master (id, code, name) VALUES
(UUID(), 'planning', 'Planning'),
(UUID(), 'active', 'Active'),
(UUID(), 'paused', 'Paused'),
(UUID(), 'completed', 'Completed'),
(UUID(), 'cancelled', 'Cancelled'),
(UUID(), 'archived', 'Archived');

SELECT CONCAT('Inserted ', ROW_COUNT(), ' campaign statuses') AS status;
