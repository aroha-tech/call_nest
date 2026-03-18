-- ============================================
-- Contact Phones Table (Per Tenant)
-- Stores one-to-many phone numbers per contact.
-- Primary phone can be marked via is_primary, and optionally
-- referenced from contacts.primary_phone_id.
-- ============================================

CREATE TABLE IF NOT EXISTS contact_phones (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  contact_id BIGINT UNSIGNED NOT NULL,

  phone VARCHAR(50) NOT NULL,
  label ENUM('mobile','home','work','whatsapp','other') NOT NULL DEFAULT 'mobile',
  is_primary TINYINT(1) NOT NULL DEFAULT 0,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,

  INDEX idx_contact_phones_contact (tenant_id, contact_id),
  INDEX idx_contact_phones_phone (tenant_id, phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

