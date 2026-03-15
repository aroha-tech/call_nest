-- ============================================
-- MIGRATION 003: Sample value for template variables (preview)
-- Used as default value when rendering script/template preview
-- Run once per database.
-- ============================================

ALTER TABLE template_variables
ADD COLUMN sample_value VARCHAR(500) NULL COMMENT 'Sample value for preview' AFTER fallback_value;

SELECT 'Migration 003 completed: sample_value added to template_variables' AS status;
