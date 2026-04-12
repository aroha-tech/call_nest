-- ============================================
-- Migration 057: Disposition action "apply_deal" — agent picks pipeline + stage on dialer
-- mysql -u root -p call_nest < server/schema/migrations/057_dispo_action_apply_deal.sql
-- ============================================

INSERT INTO dispo_actions_master (id, code, name, description, is_active, is_deleted)
VALUES (
  UUID(),
  'apply_deal',
  'Apply pipeline / deal',
  'On the dialer, the agent chooses pipeline and stage; creates or updates the contact opportunity.',
  1,
  0
)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  is_active = VALUES(is_active),
  is_deleted = 0;
