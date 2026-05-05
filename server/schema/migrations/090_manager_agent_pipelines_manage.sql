-- Grant pipelines.manage to manager and agent system roles (Deals / pipelines UI and APIs).
-- Safe to re-run: INSERT IGNORE.

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('manager', 'agent')
  AND r.is_system_role = 1
  AND p.code = 'pipelines.manage';
