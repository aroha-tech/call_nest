-- Soft delete for whatsapp_business_templates (always soft delete, never hard delete)
--
-- From project root:
--   mysql -u root -p call_nest < server/schema/migrations/014_whatsapp_business_templates_soft_delete.sql
-- Or inside MySQL:
--   USE call_nest;
--   SOURCE server/schema/migrations/014_whatsapp_business_templates_soft_delete.sql;

ALTER TABLE whatsapp_business_templates
  ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = soft deleted',
  ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL;

CREATE INDEX idx_whatsapp_business_templates_deleted
  ON whatsapp_business_templates (tenant_id, is_deleted);
