-- Grant manager + agent roles contacts.update (edit contact-type records; ownership still enforced in services).
-- Safe to re-run (INSERT IGNORE).
--
-- Apply from project root:
--   mysql -u root -p call_nest < server/schema/migrations/044_manager_agent_contacts_update.sql

USE call_nest;

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('manager', 'agent')
  AND r.is_system_role = 1
  AND p.code = 'contacts.update';
