USE call_nest;

ALTER TABLE contact_blacklist_entries
  ADD INDEX idx_blacklist_tenant_deleted_contact (tenant_id, deleted_at, contact_id),
  ADD INDEX idx_blacklist_tenant_deleted_phone (tenant_id, deleted_at, phone_e164);

ALTER TABLE contact_phones
  ADD INDEX idx_contact_phones_tenant_contact_phone (tenant_id, contact_id, phone);
