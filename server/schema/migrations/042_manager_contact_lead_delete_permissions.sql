-- Give tenant manager role contacts.delete + leads.delete (aligns with default RBAC map).
-- Safe to re-run (INSERT IGNORE).

USE call_nest;

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'manager'
  AND r.is_system_role = 1
  AND p.code IN ('contacts.delete', 'leads.delete');
