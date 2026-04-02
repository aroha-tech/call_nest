-- Workflow read-only + agent-owned scripts (run after permissions table exists)
-- Agents: view dispositions/dialing sets; create scripts; edit/delete only scripts they created

INSERT IGNORE INTO permissions (code, description) VALUES
  ('workflow.view', 'View dispositions and dialing sets (read-only)'),
  ('scripts.self', 'Create call scripts and edit or delete only scripts you created');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'agent'
  AND r.is_system_role = 1
  AND p.code IN ('workflow.view', 'scripts.self');
