-- Add multiselect_dropdown: multi-value field with options chosen from a dropdown panel (vs checkbox list).
-- Run after 039_contact_custom_fields_multiselect.sql

USE call_nest;

ALTER TABLE contact_custom_fields
  MODIFY COLUMN type ENUM(
    'text',
    'number',
    'date',
    'boolean',
    'select',
    'multiselect',
    'multiselect_dropdown'
  ) NOT NULL;
