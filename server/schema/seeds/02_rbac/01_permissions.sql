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
  ('workflow.view', 'View dispositions and dialing sets (read-only)'),
  ('scripts.self', 'Create call scripts; edit or delete only own scripts'),

  -- Telephony configuration
  ('telephony.manage', 'Manage telephony settings and configurations'),

  -- WhatsApp (granular; settings.manage still grants full module access in API checks)
  ('whatsapp.view', 'View WhatsApp templates, messages, and account list'),
  ('whatsapp.send', 'Send WhatsApp template and text messages'),
  ('whatsapp.templates.manage', 'Create and edit WhatsApp templates and message templates'),
  ('whatsapp.accounts.manage', 'Connect and manage WhatsApp Business accounts'),
  ('whatsapp.logs.view', 'View WhatsApp API request logs'),

  ('email.view', 'View email templates, sent mail, and account list'),
  ('email.send', 'Send email from tenant accounts'),
  ('email.templates.manage', 'Create and edit email module templates'),
  ('email.accounts.manage', 'Connect and manage email accounts (SMTP/OAuth)'),

  ('meetings.view', 'View meetings calendar and list'),
  ('meetings.manage', 'Create, edit, and delete meetings');

SELECT CONCAT('Inserted ', ROW_COUNT(), ' permissions') AS status;
