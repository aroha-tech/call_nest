-- Migration: Add actions JSON column to dispositions tables
-- This stores disposition actions as a JSON array instead of a separate mapping table
-- Format: [{"action_id": "uuid", "email_template_id": "uuid|null", "whatsapp_template_id": "uuid|null"}, ...]

-- Add actions column to default_dispositions
ALTER TABLE default_dispositions
ADD COLUMN actions JSON NULL AFTER is_connected;

-- Add actions column to dispositions
ALTER TABLE dispositions
ADD COLUMN actions JSON NULL AFTER is_connected;
