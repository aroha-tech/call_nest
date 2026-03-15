-- ============================================
-- SEED: Contact Status Master
-- Platform-wide contact lifecycle stages
-- Used to track contact/lead progression
-- ============================================

INSERT INTO contact_status_master (id, code, name) VALUES
(UUID(), 'new', 'New'),
(UUID(), 'contacted', 'Contacted'),
(UUID(), 'qualified', 'Qualified'),
(UUID(), 'unqualified', 'Unqualified'),
(UUID(), 'nurturing', 'Nurturing'),
(UUID(), 'proposal_sent', 'Proposal Sent'),
(UUID(), 'negotiation', 'Negotiation'),
(UUID(), 'converted', 'Converted'),
(UUID(), 'lost', 'Lost'),
(UUID(), 'on_hold', 'On Hold'),
(UUID(), 'dnc', 'Do Not Contact');

SELECT CONCAT('Inserted ', ROW_COUNT(), ' contact statuses') AS status;
