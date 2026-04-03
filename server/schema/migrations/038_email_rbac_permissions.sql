-- Email module RBAC (aligned with WhatsApp granular permissions).

INSERT IGNORE INTO permissions (code, description) VALUES
  ('email.view', 'View email templates, sent mail, and account list'),
  ('email.send', 'Send email from tenant accounts'),
  ('email.templates.manage', 'Create and edit email module templates'),
  ('email.accounts.manage', 'Connect and manage email accounts (SMTP/OAuth)');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin'
  AND r.is_system_role = 1
  AND p.code IN (
    'email.view',
    'email.send',
    'email.templates.manage',
    'email.accounts.manage'
  );

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'manager'
  AND r.is_system_role = 1
  AND p.code IN (
    'email.view',
    'email.send',
    'email.templates.manage'
  );

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'agent'
  AND r.is_system_role = 1
  AND p.code IN (
    'email.view',
    'email.send'
  );
