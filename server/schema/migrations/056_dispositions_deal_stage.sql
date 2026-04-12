-- ============================================
-- Migration 056: Dispositions — optional pipeline + stage to apply on call outcome
-- When an agent selects this disposition, the contact's deal (opportunity) is created/updated to this pipeline/stage.
-- mysql -u root -p call_nest < server/schema/migrations/056_dispositions_deal_stage.sql
-- ============================================

ALTER TABLE dispositions ADD COLUMN deal_id BIGINT UNSIGNED NULL;
ALTER TABLE dispositions ADD COLUMN stage_id BIGINT UNSIGNED NULL;

ALTER TABLE dispositions ADD INDEX idx_dispositions_deal (tenant_id, deal_id);
ALTER TABLE dispositions ADD INDEX idx_dispositions_stage (tenant_id, stage_id);

ALTER TABLE dispositions
  ADD CONSTRAINT fk_dispositions_deal FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL;

ALTER TABLE dispositions
  ADD CONSTRAINT fk_dispositions_stage FOREIGN KEY (stage_id) REFERENCES deal_stages(id) ON DELETE SET NULL;
