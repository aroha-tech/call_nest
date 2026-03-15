-- Migration: Fix users role ENUM to match expected values
-- This fixes "Data truncated for column 'role'" error
-- Roles: super_admin, admin, manager, agent (4 roles only)

ALTER TABLE users 
MODIFY COLUMN role ENUM('super_admin', 'admin', 'manager', 'agent') NULL;
