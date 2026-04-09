-- Dialer sessions: add ready/paused status + pause tracking and connected stats.
-- Run (file): mysql -u root -p call_nest < server/schema/migrations/050_dialer_sessions_pause_resume.sql

-- Expand status enum to support: ready (created, not started), paused (temporarily stopped)
ALTER TABLE dialer_sessions
  MODIFY COLUMN status ENUM('ready','active','paused','completed','cancelled') NOT NULL DEFAULT 'ready';

-- Track paused duration so UI timer can be accurate.
ALTER TABLE dialer_sessions
  ADD COLUMN paused_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN paused_seconds INT UNSIGNED NOT NULL DEFAULT 0;

