-- Migration: Add RBAC columns to users table
-- SAFE: Checks if columns exist before adding
-- Preserves existing data and maintains backward compatibility

-- Step 1: Add role_id column (nullable for migration period)
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'role_id'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN role_id BIGINT UNSIGNED NULL AFTER role',
  'SELECT "Column role_id already exists"'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 2: Add token_version for JWT invalidation control
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'token_version'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 1 AFTER role_id',
  'SELECT "Column token_version already exists"'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 3: Add index for role_id lookups
SET @index_exists = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND index_name = 'idx_users_role_id'
);

SET @sql = IF(@index_exists = 0,
  'ALTER TABLE users ADD INDEX idx_users_role_id (role_id)',
  'SELECT "Index idx_users_role_id already exists"'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 4: Add foreign key constraint (if not exists)
SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND constraint_name = 'fk_users_role'
);

SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE users ADD CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL',
  'SELECT "FK fk_users_role already exists"'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Note: ENUM role column is kept for backward compatibility during migration
-- Application layer will use role_id for authorization decisions
-- ENUM role can be deprecated in future release after full migration
