-- ============================================
-- SEED: Permissions
-- Platform-wide permission codes used across all tenants
-- INSERT IGNORE prevents duplicates on re-run
-- ============================================

INSERT IGNORE INTO permissions (code, description) VALUES
  -- Dashboard
  ('dashboard.view', 'View dashboard and analytics'),

  -- Contacts management
  ('contacts.read', 'View contacts'),
  ('contacts.create', 'Create new contacts'),
  ('contacts.update', 'Update existing contacts'),
  ('contacts.delete', 'Delete contacts'),

  -- Leads management
  ('leads.read', 'View leads'),
  ('leads.create', 'Create new leads'),
  ('leads.update', 'Update existing leads'),
  ('leads.delete', 'Delete leads'),

  -- Dialing operations
  ('dial.execute', 'Make outbound calls'),
  ('dial.monitor', 'Monitor live calls and agent activity'),

  -- Reporting
  ('reports.view', 'View reports and analytics'),

  -- User management
  ('users.manage', 'Manage users (create, update, disable)'),
  ('users.team', 'Manage agents on your team (assign to team / unassign)'),

  -- Pipeline management
  ('pipelines.manage', 'Manage sales pipelines and stages'),

  -- Settings
  ('settings.manage', 'Manage tenant settings'),

  -- Disposition management
  ('dispositions.manage', 'Manage call dispositions'),

  -- Telephony configuration
  ('telephony.manage', 'Manage telephony settings and configurations');

SELECT CONCAT('Inserted ', ROW_COUNT(), ' permissions') AS status;
