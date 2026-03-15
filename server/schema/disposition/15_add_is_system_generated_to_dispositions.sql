-- Migration: Add is_system_generated flag to dispositions
-- Purpose: Mark dispositions that came from system/default templates (e.g. cloned from super admin)

ALTER TABLE dispositions
  ADD COLUMN is_system_generated TINYINT(1) NOT NULL DEFAULT 0
  AFTER is_active;

