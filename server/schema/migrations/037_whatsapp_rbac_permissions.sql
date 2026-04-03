-- Granular WhatsApp RBAC: view/send vs template & account management vs API logs.
-- settings.manage continues to imply full WhatsApp access (backward compatibility).

INSERT IGNORE INTO permissions (code, description) VALUES
  ('whatsapp.view', 'View WhatsApp templates, messages, and account list'),
  ('whatsapp.send', 'Send WhatsApp template and text messages'),
  ('whatsapp.templates.manage', 'Create and edit WhatsApp templates and message templates'),
  ('whatsapp.accounts.manage', 'Connect and manage WhatsApp Business accounts'),
  ('whatsapp.logs.view', 'View WhatsApp API request logs');

-- Admin: all WhatsApp permissions
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin'
  AND r.is_system_role = 1
  AND p.code IN (
    'whatsapp.view',
    'whatsapp.send',
    'whatsapp.templates.manage',
    'whatsapp.accounts.manage',
    'whatsapp.logs.view'
  );

-- Manager: view, send, edit templates; read-only accounts; logs
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'manager'
  AND r.is_system_role = 1
  AND p.code IN (
    'whatsapp.view',
    'whatsapp.send',
    'whatsapp.templates.manage',
    'whatsapp.logs.view'
  );

-- Agent: view + send only (no template/account edits, no API logs)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'agent'
  AND r.is_system_role = 1
  AND p.code IN (
    'whatsapp.view',
    'whatsapp.send'
  );
