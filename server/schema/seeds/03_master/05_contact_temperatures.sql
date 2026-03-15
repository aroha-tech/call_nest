-- ============================================
-- SEED: Contact Temperature Master
-- Platform-wide lead temperature levels
-- priority_order determines display order (lower = higher priority)
-- ============================================

INSERT INTO contact_temperature_master (id, code, name, priority_order) VALUES
(UUID(), 'hot', 'Hot', 1),
(UUID(), 'warm', 'Warm', 2),
(UUID(), 'cold', 'Cold', 3),
(UUID(), 'dead', 'Dead', 4);

SELECT CONCAT('Inserted ', ROW_COUNT(), ' contact temperatures') AS status;
