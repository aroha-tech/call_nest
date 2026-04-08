-- Per-agent delete settings (instead of workspace-wide).
-- Allows admin/manager to enable delete for specific agents only.
--
-- Apply from project root:
--   mysql -u root -p call_nest < server/schema/migrations/043_agent_delete_per_user.sql

USE call_nest;

ALTER TABLE users
  ADD COLUMN agent_can_delete_leads TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'If 1, this agent may delete lead records they can access (requires leads.update)',
  ADD COLUMN agent_can_delete_contacts TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'If 1, this agent may delete contact records they can access (requires contacts.update)';

