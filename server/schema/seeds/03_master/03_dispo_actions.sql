-- ============================================
-- SEED: Disposition Actions Master
-- Platform-wide action definitions
-- Actions triggered after call disposition
-- ============================================

INSERT INTO dispo_actions_master (id, code, name, description) VALUES
(UUID(), 'schedule_callback', 'Schedule Callback', 'Schedule a follow-up call with the contact'),
(UUID(), 'send_email', 'Send Email', 'Send an automated or manual email'),
(UUID(), 'send_sms', 'Send SMS', 'Send an SMS message to the contact'),
(UUID(), 'send_whatsapp', 'Send WhatsApp', 'Send a WhatsApp message'),
(UUID(), 'create_task', 'Create Task', 'Create a follow-up task'),
(UUID(), 'assign_to_agent', 'Assign to Agent', 'Reassign the contact to another agent'),
(UUID(), 'move_to_campaign', 'Move to Campaign', 'Move contact to a different campaign'),
(UUID(), 'add_to_dnc', 'Add to DNC List', 'Add contact to Do Not Call list'),
(UUID(), 'update_status', 'Update Status', 'Update the contact status'),
(UUID(), 'mark_converted', 'Mark as Converted', 'Mark the lead as converted'),
(UUID(), 'schedule_meeting', 'Schedule Meeting', 'Schedule a meeting or demo'),
(UUID(), 'send_proposal', 'Send Proposal', 'Send a proposal or quote');

SELECT CONCAT('Inserted ', ROW_COUNT(), ' disposition actions') AS status;
