-- ============================================
-- SEED: Template Variables (System-level)
-- Used by Call Scripts, WhatsApp, Email, SMS templates
-- ============================================

INSERT INTO template_variables (variable_key, variable_label, module, source_table, source_column, fallback_value, sample_value, description, is_active) VALUES
-- CONTACT
('contact_first_name', 'Contact First Name', 'contact', 'contacts', 'first_name', NULL, 'Rahul', 'Contact first name', 1),
('contact_last_name', 'Contact Last Name', 'contact', 'contacts', 'last_name', NULL, 'Sharma', 'Contact last name', 1),
('contact_full_name', 'Contact Full Name', 'contact', NULL, NULL, NULL, 'Rahul Sharma', 'Computed: first_name + last_name', 1),
('contact_phone', 'Contact Phone', 'contact', 'contacts', 'phone', NULL, '+91 98765 43210', 'Contact phone number', 1),
('contact_email', 'Contact Email', 'contact', 'contacts', 'email', NULL, 'rahul@example.com', 'Contact email address', 1),
-- AGENT
('agent_name', 'Agent Name', 'agent', 'users', 'name', NULL, 'Amit', 'Logged-in agent/user display name', 1),
('agent_email', 'Agent Email', 'agent', 'users', 'email', NULL, 'amit@company.com', 'Logged-in agent email', 1),
-- COMPANY
('company_name', 'Company Name', 'company', 'tenants', 'name', NULL, 'Arohva', 'Tenant/company name', 1),
('company_phone', 'Company Phone', 'company', 'tenants', 'phone', NULL, '+91 1800 123 456', 'Tenant/company phone', 1),
('company_email', 'Company Email', 'company', 'tenants', 'email', NULL, 'hello@arohva.com', 'Tenant/company email', 1),
-- SYSTEM
('today_date', 'Today Date', 'system', NULL, NULL, NULL, NULL, 'Current date', 1),
('current_time', 'Current Time', 'system', NULL, NULL, NULL, NULL, 'Current time', 1),
-- LINK
('booking_link', 'Booking Link', 'link', NULL, NULL, NULL, 'https://book.example.com/schedule', 'URL for booking page', 1),
('form_link', 'Form Link', 'link', NULL, NULL, NULL, 'https://forms.example.com/survey', 'URL for form or survey', 1),
('company_website', 'Company Website', 'link', NULL, NULL, NULL, 'https://arohva.com', 'Company website URL', 1),
('support_link', 'Support Link', 'link', NULL, NULL, NULL, 'https://support.arohva.com', 'Support or help URL', 1),
('portal_link', 'Customer Portal Link', 'link', NULL, NULL, NULL, 'https://portal.arohva.com', 'Customer portal URL', 1);

SELECT CONCAT('Inserted ', ROW_COUNT(), ' template variables') AS status;
