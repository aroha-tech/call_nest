-- Per-user date/time preferences used across app UI formatting.
-- datetime_timezone: IANA timezone (e.g. Asia/Kolkata, America/New_York)
-- datetime_date_format: display order/separator for calendar date
-- datetime_time_format: 12h/24h and seconds preference

ALTER TABLE users
  ADD COLUMN datetime_timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata' AFTER datetime_display_mode,
  ADD COLUMN datetime_date_format ENUM('DD-MM-YYYY', 'DD/MM/YYYY', 'MM-DD-YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD') NOT NULL DEFAULT 'DD-MM-YYYY' AFTER datetime_timezone,
  ADD COLUMN datetime_time_format ENUM('12h_with_seconds', '12h', '24h_with_seconds', '24h') NOT NULL DEFAULT '12h_with_seconds' AFTER datetime_date_format;
