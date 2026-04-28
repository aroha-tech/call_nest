USE call_nest;

-- Dialer list performance indexes for tenant-scoped lead fetches.
-- Added conditionally to avoid failing on environments where an index may already exist.

SET @idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'contacts'
    AND index_name = 'idx_contacts_dialer_base'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE contacts ADD INDEX idx_contacts_dialer_base (tenant_id, deleted_at, type, created_at, id)',
  'SELECT "idx_contacts_dialer_base exists"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'contacts'
    AND index_name = 'idx_contacts_dialer_touch'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE contacts ADD INDEX idx_contacts_dialer_touch (tenant_id, deleted_at, type, last_called_at, call_count_total, id)',
  'SELECT "idx_contacts_dialer_touch exists"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'contacts'
    AND index_name = 'idx_contacts_dialer_assignment'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE contacts ADD INDEX idx_contacts_dialer_assignment (tenant_id, deleted_at, type, manager_id, assigned_user_id, id)',
  'SELECT "idx_contacts_dialer_assignment exists"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

