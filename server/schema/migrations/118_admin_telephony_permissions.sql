-- ============================================
-- Grant telephony BYO permissions to system admin role when missing.
-- Call billing mode (credit / unlimited) remains super-admin only
-- (platform Telephony & Credits UI / admin API).
--
-- Run:
--   mysql -u root -p call_nest < server/schema/migrations/118_admin_telephony_permissions.sql
-- Or:
--   USE call_nest; source server/schema/migrations/118_admin_telephony_permissions.sql;
-- ============================================

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin'
  AND r.is_system_role = 1
  AND p.code IN (
    'telephony.accounts.view',
    'telephony.accounts.manage',
    'billing.credits.view'
  );

-- Remove billing.mode.manage from admin if a prior draft migration added it.
DELETE rp
FROM role_permissions rp
INNER JOIN permissions p ON p.id = rp.permission_id
INNER JOIN roles r ON r.id = rp.role_id
WHERE r.name = 'admin'
  AND r.is_system_role = 1
  AND p.code = 'billing.mode.manage';

DELETE FROM permissions WHERE code = 'billing.mode.manage';
