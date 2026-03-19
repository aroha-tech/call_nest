INSERT IGNORE INTO permissions (code, description) VALUES
  ('users.team', 'Manage agents on your team (assign to team / unassign)');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'manager'
  AND r.is_system_role = 1
  AND p.code = 'users.team';
