-- Per-user preference: how dates/times are shown in the app UI.
-- ist_fixed: Asia/Kolkata, DD/MM/YYYY style + 12h time with seconds (default for all existing users).
-- browser_local: visitor's system timezone and locale via Intl.

ALTER TABLE users
  ADD COLUMN datetime_display_mode ENUM('ist_fixed', 'browser_local') NOT NULL DEFAULT 'ist_fixed'
  AFTER last_login_at;
