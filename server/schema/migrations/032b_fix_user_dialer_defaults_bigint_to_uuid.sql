-- Run ONLY if you already applied an older 032 that used BIGINT for default_dialing_set_id
-- (FK to dialing_sets failed or column type was wrong). This fixes the column to CHAR(36).

-- If FK was created with wrong types, drop it first (ignore error if it does not exist):
-- ALTER TABLE users DROP FOREIGN KEY fk_users_default_dialing_set;

ALTER TABLE users
  MODIFY COLUMN default_dialing_set_id CHAR(36) NULL DEFAULT NULL
    COMMENT 'User preferred dialing set (UUID = dialing_sets.id)';

ALTER TABLE users
  ADD CONSTRAINT fk_users_default_dialing_set
    FOREIGN KEY (default_dialing_set_id) REFERENCES dialing_sets(id) ON DELETE SET NULL;
