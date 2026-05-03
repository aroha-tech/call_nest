USE call_nest;

-- Supports dialer list filter: leads with a non-null primary_phone_id (INNER JOIN to contact_phones).
-- Added conditionally to avoid failing when the index already exists.

SET @idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'contacts'
    AND index_name = 'idx_contacts_dialer_primary_phone'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE contacts ADD INDEX idx_contacts_dialer_primary_phone (tenant_id, deleted_at, type, primary_phone_id, id)',
  'SELECT "idx_contacts_dialer_primary_phone exists"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
