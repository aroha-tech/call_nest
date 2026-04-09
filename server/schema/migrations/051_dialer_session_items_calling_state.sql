-- Ensure dialer_session_items.state includes 'calling' (required for in-progress first dial).
-- Run: mysql -u root -p call_nest < server/schema/migrations/051_dialer_session_items_calling_state.sql

ALTER TABLE dialer_session_items
  MODIFY COLUMN state ENUM('queued','calling','called','skipped','failed') NOT NULL DEFAULT 'queued';
