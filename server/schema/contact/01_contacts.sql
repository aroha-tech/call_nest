-- ============================================
-- Contacts Table (Leads + Contacts, Per Tenant)
-- Stores both raw leads and active contacts.
-- Ownership is enforced via manager_id and assigned_user_id.
-- Multi-tenant: every row scoped by tenant_id.
-- ============================================

CREATE TABLE IF NOT EXISTS contacts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,

  -- Lead vs Contact
  type ENUM('lead','contact') NOT NULL DEFAULT 'lead',

  -- Basic info
  first_name VARCHAR(100) NULL,
  last_name VARCHAR(100) NULL,
  display_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NULL,
  source VARCHAR(100) NULL,

  -- Profile & location (defaults on every contact / lead)
  city VARCHAR(150) NULL,
  state VARCHAR(150) NULL,
  country VARCHAR(100) NULL,
  address VARCHAR(500) NULL,
  address_line_2 VARCHAR(255) NULL,
  pin_code VARCHAR(20) NULL,
  company VARCHAR(255) NULL,
  job_title VARCHAR(150) NULL,
  website VARCHAR(500) NULL,
  industry VARCHAR(150) NULL,
  date_of_birth DATE NULL,
  tax_id VARCHAR(50) NULL,
  notes TEXT NULL COMMENT 'Contact-level notes; per-call notes are on contact_call_attempts',
  industry_profile JSON NULL COMMENT 'Industry-specific field values (object keyed by field_key)',

  -- Ownership
  manager_id BIGINT UNSIGNED NULL,
  assigned_user_id BIGINT UNSIGNED NULL,

  -- Status (linked to contact_status_master via tenant-specific mapping or direct id if needed)
  status_id CHAR(36) NULL,

  -- Static campaign linkage (filter campaigns are dynamic via filters_json)
  campaign_id BIGINT UNSIGNED NULL,

  -- Optional reference to primary phone in contact_phones
  primary_phone_id BIGINT UNSIGNED NULL,

  -- Audit
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_source ENUM('manual','import','api','integration') NOT NULL DEFAULT 'manual',
  deleted_source ENUM('manual','import','api','integration','bulk_job') NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,

  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL,

  INDEX idx_contacts_tenant (tenant_id, id),
  INDEX idx_contacts_manager (tenant_id, manager_id),
  INDEX idx_contacts_assigned_user (tenant_id, assigned_user_id),
  INDEX idx_contacts_status (tenant_id, status_id),
  INDEX idx_contacts_campaign (tenant_id, campaign_id),
  INDEX idx_contacts_deleted_at (tenant_id, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

