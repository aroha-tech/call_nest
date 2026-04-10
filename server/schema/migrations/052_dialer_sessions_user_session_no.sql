-- Per-user sequential dial session number (1, 2, 3…) within tenant (never expose UUIDs in UI for this).
-- Requires MySQL 8+ for ROW_NUMBER in UPDATE.
-- Paste-ready:
--
-- ALTER TABLE dialer_sessions
--   ADD COLUMN user_session_no INT UNSIGNED NULL DEFAULT NULL
--   COMMENT 'Per-user sequential dial session number within tenant'
--   AFTER created_by_user_id;
--
-- UPDATE dialer_sessions ds
-- INNER JOIN (
--   SELECT id,
--     ROW_NUMBER() OVER (
--       PARTITION BY tenant_id, IFNULL(created_by_user_id, 0)
--       ORDER BY id ASC
--     ) AS rn
--   FROM dialer_sessions
-- ) t ON t.id = ds.id
-- SET ds.user_session_no = t.rn;
--
-- ALTER TABLE dialer_sessions
--   MODIFY COLUMN user_session_no INT UNSIGNED NOT NULL,
--   ADD KEY idx_ds_tenant_user_session_no (tenant_id, created_by_user_id, user_session_no);

ALTER TABLE dialer_sessions
  ADD COLUMN user_session_no INT UNSIGNED NULL DEFAULT NULL
  COMMENT 'Per-user sequential dial session number within tenant'
  AFTER created_by_user_id;

UPDATE dialer_sessions ds
INNER JOIN (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, IFNULL(created_by_user_id, 0)
      ORDER BY id ASC
    ) AS rn
  FROM dialer_sessions
) t ON t.id = ds.id
SET ds.user_session_no = t.rn;

ALTER TABLE dialer_sessions
  MODIFY COLUMN user_session_no INT UNSIGNED NOT NULL,
  ADD KEY idx_ds_tenant_user_session_no (tenant_id, created_by_user_id, user_session_no);
