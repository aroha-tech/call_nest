INSERT IGNORE INTO permissions (code, description) VALUES
  ('tasks.view', 'View task manager and assigned tasks'),
  ('tasks.manage', 'Create and manage task templates and assignments'),
  ('tasks.notes.manage', 'Write manager notes on task logs'),
  ('reports.performance.view', 'View role-wise task performance reports'),
  ('reports.performance.export', 'Export role-wise task performance reports');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'tasks.view',
  'tasks.manage',
  'tasks.notes.manage',
  'reports.performance.view',
  'reports.performance.export'
)
WHERE r.is_system_role = 1
  AND r.name = 'admin';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'tasks.view',
  'tasks.manage',
  'tasks.notes.manage',
  'reports.performance.view',
  'reports.performance.export'
)
WHERE r.is_system_role = 1
  AND r.name = 'manager';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'tasks.view',
  'reports.performance.view'
)
WHERE r.is_system_role = 1
  AND r.name = 'agent';
