-- ============================================
-- Migration 097: Opportunities — draft flag (excluded from board & duplicate checks)
-- mysql -u root -p call_nest < server/schema/migrations/097_opportunities_is_draft.sql
-- Or: USE call_nest; SOURCE server/schema/migrations/097_opportunities_is_draft.sql;
-- ============================================

ALTER TABLE opportunities ADD COLUMN is_draft TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE opportunities ADD INDEX idx_opp_tenant_deal_draft (tenant_id, deal_id, is_draft, deleted_at);
