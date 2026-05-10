-- ============================================
-- Migration 100: scheduled_callbacks — add status 'missed' (auto after grace, like meetings)
-- Paste-ready SQL for SQL editors:
--   USE call_nest;
--   SOURCE server/schema/migrations/100_scheduled_callbacks_status_missed.sql;
--
-- File-based run from project root:
--   mysql -u root -p call_nest < server/schema/migrations/100_scheduled_callbacks_status_missed.sql
--   -- or inside MySQL after USE call_nest;
--   source server/schema/migrations/100_scheduled_callbacks_status_missed.sql
-- ============================================

ALTER TABLE scheduled_callbacks
  MODIFY COLUMN status ENUM('pending', 'completed', 'cancelled', 'missed') NOT NULL DEFAULT 'pending';

UPDATE scheduled_callbacks
SET status = 'missed',
    updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL
  AND status = 'pending'
  AND scheduled_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE);
