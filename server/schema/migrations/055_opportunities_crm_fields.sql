-- ============================================
-- Migration 055: Opportunities — CRM-style fields (Zoho-inspired)
-- Owner, closing date, probability override, expected revenue, source, type, next step, description, campaign.
-- TiDB: run one ALTER per statement if combined ALTER fails.
-- mysql -u root -p call_nest < server/schema/migrations/055_opportunities_crm_fields.sql
-- ============================================

ALTER TABLE opportunities ADD COLUMN owner_id BIGINT UNSIGNED NULL;
ALTER TABLE opportunities ADD COLUMN closing_date DATE NULL;
ALTER TABLE opportunities ADD COLUMN probability_percent DECIMAL(5,2) NULL;
ALTER TABLE opportunities ADD COLUMN expected_revenue DECIMAL(14,2) NULL;
ALTER TABLE opportunities ADD COLUMN lead_source VARCHAR(100) NULL;
ALTER TABLE opportunities ADD COLUMN deal_type VARCHAR(80) NULL;
ALTER TABLE opportunities ADD COLUMN next_step VARCHAR(500) NULL;
ALTER TABLE opportunities ADD COLUMN description TEXT NULL;
ALTER TABLE opportunities ADD COLUMN campaign_id BIGINT UNSIGNED NULL;

ALTER TABLE opportunities ADD INDEX idx_opp_tenant_owner (tenant_id, owner_id);
ALTER TABLE opportunities ADD INDEX idx_opp_tenant_campaign (tenant_id, campaign_id);
ALTER TABLE opportunities ADD INDEX idx_opp_closing (tenant_id, closing_date);

ALTER TABLE opportunities
  ADD CONSTRAINT fk_opportunities_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE opportunities
  ADD CONSTRAINT fk_opportunities_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;
