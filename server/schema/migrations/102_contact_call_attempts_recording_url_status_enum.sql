-- Call recordings (Exotel etc.) + terminal statuses for webhooks (no_answer, busy).
-- Run: mysql -u root -p call_nest < server/schema/migrations/102_contact_call_attempts_recording_url_status_enum.sql
-- Or: USE call_nest; source server/schema/migrations/102_contact_call_attempts_recording_url_status_enum.sql;

ALTER TABLE contact_call_attempts
  ADD COLUMN recording_url VARCHAR(2048) NULL COMMENT 'Provider recording URL (e.g. Exotel StatusCallback RecordingUrl)' AFTER duration_sec;

ALTER TABLE contact_call_attempts
  MODIFY COLUMN status ENUM(
    'queued',
    'ringing',
    'connected',
    'completed',
    'failed',
    'cancelled',
    'no_answer',
    'busy'
  ) NOT NULL DEFAULT 'completed';
