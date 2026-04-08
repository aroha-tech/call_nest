-- ============================================
-- SEED: Role Permissions
-- Maps permissions to admin, manager, agent roles
-- Safe to re-run: uses INSERT IGNORE to prevent duplicates
-- ============================================

-- ADMIN ROLE: All permissions except platform-only
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin'
  AND r.is_system_role = 1
  AND p.code IN (
    'dashboard.view',
    'contacts.read',
    'contacts.create',
    'contacts.update',
    'contacts.delete',
    'leads.read',
    'leads.create',
    'leads.update',
    'leads.delete',
    'dial.execute',
    'dial.monitor',
    'reports.view',
    'users.manage',
    'pipelines.manage',
    'settings.manage',
    'dispositions.manage',
    'telephony.manage',
    'whatsapp.view',
    'whatsapp.send',
    'whatsapp.templates.manage',
    'whatsapp.accounts.manage',
    'whatsapp.logs.view',
    'email.view',
    'email.send',
    'email.templates.manage',
    'email.accounts.manage'
  );

-- MANAGER ROLE: Monitoring and reporting
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id

FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'manager'
  AND r.is_system_role = 1
  AND p.code IN (
    'dashboard.view',
    'contacts.read',
    'contacts.update',
    'contacts.delete',
    'leads.read',
    'leads.create',
    'leads.update',
    'leads.delete',
    'dial.monitor',
    'reports.view',
    'users.team',
    'whatsapp.view',
    'whatsapp.send',
    'whatsapp.templates.manage',
    'whatsapp.logs.view',
    'email.view',
    'email.send',
    'email.templates.manage'
  );

-- AGENT ROLE: Basic dialing and contact access
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'agent'
  AND r.is_system_role = 1
  AND p.code IN (
    'dashboard.view',
    'contacts.read',
    'contacts.update',
    'leads.read',
    'leads.create',
    'leads.update',
    'dial.execute',
    'workflow.view',
    'scripts.self',
    'whatsapp.view',
    'whatsapp.send',
    'email.view',
    'email.send'
  );

SELECT 'Role permissions mapped' AS status;
