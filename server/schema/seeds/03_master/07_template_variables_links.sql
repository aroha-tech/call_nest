-- ============================================
-- SEED: Link template variables (run this if you already ran 06 and need link variables)
-- ============================================

INSERT IGNORE INTO template_variables (variable_key, variable_label, module, source_table, source_column, fallback_value, sample_value, description, is_active) VALUES
('booking_link', 'Booking Link', 'link', NULL, NULL, NULL, 'https://book.example.com/schedule', 'URL for booking page', 1),
('form_link', 'Form Link', 'link', NULL, NULL, NULL, 'https://forms.example.com/survey', 'URL for form or survey', 1),
('company_website', 'Company Website', 'link', NULL, NULL, NULL, 'https://arohva.com', 'Company website URL', 1),
('support_link', 'Support Link', 'link', NULL, NULL, NULL, 'https://support.arohva.com', 'Support or help URL', 1),
('portal_link', 'Customer Portal Link', 'link', NULL, NULL, NULL, 'https://portal.arohva.com', 'Customer portal URL', 1);

SELECT CONCAT('Link variables: ', ROW_COUNT(), ' rows affected') AS status;
