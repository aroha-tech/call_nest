-- ============================================
-- SEED: Industries Master
-- Platform-wide industry definitions
-- Used for industry-specific default dispositions
-- ============================================

INSERT INTO industries (id, name, code) VALUES
(UUID(), 'Real Estate', 'real_estate'),
(UUID(), 'Insurance', 'insurance'),
(UUID(), 'Banking & Financial Services', 'bfs'),
(UUID(), 'Education', 'education'),
(UUID(), 'EdTech', 'edtech'),
(UUID(), 'Healthcare', 'healthcare'),
(UUID(), 'Automobile', 'automobile'),
(UUID(), 'Travel & Tourism', 'travel'),
(UUID(), 'E-commerce', 'ecommerce'),
(UUID(), 'Retail', 'retail'),
(UUID(), 'SaaS / Software', 'saas'),
(UUID(), 'IT Services', 'it_services'),
(UUID(), 'Recruitment & Staffing', 'recruitment'),
(UUID(), 'NBFC', 'nbfc'),
(UUID(), 'DSA / Loan Agency', 'dsa'),
(UUID(), 'Telecom', 'telecom'),
(UUID(), 'Marketing Agency', 'marketing_agency'),
(UUID(), 'BPO / Call Center', 'bpo'),
(UUID(), 'Logistics & Supply Chain', 'logistics'),
(UUID(), 'Manufacturing', 'manufacturing'),
(UUID(), 'Fitness & Wellness', 'fitness'),
(UUID(), 'Hospitality', 'hospitality'),
(UUID(), 'NGO / Non-Profit', 'ngo'),
(UUID(), 'Franchise Business', 'franchise'),
(UUID(), 'Generic Sales Organization', 'generic_sales');

SELECT CONCAT('Inserted ', ROW_COUNT(), ' industries') AS status;
