-- ============================================
-- Migration 021: campaigns — full audit trail
-- Adds updated_by, deleted_at, deleted_by (matches contacts pattern).
-- Safe to skip if your CREATE already includes these columns.
-- ============================================

ALTER TABLE campaigns
  ADD COLUMN updated_by BIGINT UNSIGNED NULL AFTER created_by;

ALTER TABLE campaigns
  ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at;

ALTER TABLE campaigns
  ADD COLUMN deleted_by BIGINT UNSIGNED NULL AFTER deleted_at;

ALTER TABLE campaigns
  ADD CONSTRAINT fk_campaigns_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE campaigns
  ADD CONSTRAINT fk_campaigns_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE campaigns
  ADD INDEX idx_campaigns_deleted_at (tenant_id, deleted_at);
