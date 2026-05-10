-- ============================================
-- Migration 096: Pipelines (deals) — wizard fields, stage colors, opportunity extras
-- mysql -u root -p call_nest < server/schema/migrations/096_deals_pipeline_wizard_fields.sql
-- Or: USE call_nest; SOURCE server/schema/migrations/096_deals_pipeline_wizard_fields.sql;
-- ============================================

ALTER TABLE deals ADD COLUMN owner_user_id BIGINT UNSIGNED NULL;
ALTER TABLE deals ADD COLUMN currency_code VARCHAR(8) NOT NULL DEFAULT 'USD';
ALTER TABLE deals ADD COLUMN probability_mode VARCHAR(16) NOT NULL DEFAULT 'stage';
ALTER TABLE deals ADD COLUMN goal_amount DECIMAL(14,2) NULL;
ALTER TABLE deals ADD COLUMN goal_deals INT UNSIGNED NULL;
ALTER TABLE deals ADD COLUMN visibility VARCHAR(16) NOT NULL DEFAULT 'private';

ALTER TABLE deals ADD INDEX idx_deals_tenant_owner (tenant_id, owner_user_id);

ALTER TABLE deals
  ADD CONSTRAINT fk_deals_owner_user FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE deal_stages ADD COLUMN color_hex VARCHAR(7) NULL;

ALTER TABLE opportunities ADD COLUMN priority VARCHAR(16) NULL;
ALTER TABLE opportunities ADD COLUMN tags_json JSON NULL;
ALTER TABLE opportunities ADD COLUMN amount_currency VARCHAR(8) NULL;
ALTER TABLE opportunities ADD COLUMN value_type VARCHAR(64) NULL;
