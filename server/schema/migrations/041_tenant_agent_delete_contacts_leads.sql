-- Let workspace admins/managers choose whether agents may delete leads and/or contacts.
-- Apply from project root:
--   mysql -u root -p call_nest < server/schema/migrations/041_tenant_agent_delete_contacts_leads.sql

USE call_nest;

ALTER TABLE tenants
  ADD COLUMN agents_can_delete_leads TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'If 1, agents with leads.update may delete lead records they can access',
  ADD COLUMN agents_can_delete_contacts TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'If 1, agents with contacts.update may delete contact records they can access';
