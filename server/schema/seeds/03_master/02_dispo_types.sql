-- ============================================
-- SEED: Disposition Types Master
-- Platform-wide disposition type categories
-- Used to classify dispositions by outcome type
-- ============================================

INSERT INTO dispo_types_master (id, code, name) VALUES
(UUID(), 'connected', 'Connected'),
(UUID(), 'not_connected', 'Not Connected'),
(UUID(), 'callback', 'Callback'),
(UUID(), 'not_interested', 'Not Interested'),
(UUID(), 'converted', 'Converted'),
(UUID(), 'dnc', 'Do Not Call'),
(UUID(), 'wrong_number', 'Wrong Number'),
(UUID(), 'voicemail', 'Voicemail'),
(UUID(), 'busy', 'Busy'),
(UUID(), 'no_answer', 'No Answer');

SELECT CONCAT('Inserted ', ROW_COUNT(), ' disposition types') AS status;
