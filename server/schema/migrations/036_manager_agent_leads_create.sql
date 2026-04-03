-- Grant leads.create to manager and agent (add/import leads; ownership defaults applied in createContact)

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('manager', 'agent')
  AND r.is_system_role = 1
  AND p.code = 'leads.create';
