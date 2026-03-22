-- Migration 027: Tenant-scoped contact tags (many per contact) + migrate legacy contacts.tag text.
-- Prerequisites: 026_contacts_tag.sql applied (contacts.tag column exists), or skip migration blocks if not.
-- Run: mysql -u root -p call_nest < server/schema/migrations/027_contact_tags_master.sql

-- ---------------------------------------------------------------------------
-- 1) Master tags (tenant scope only; no manager_id — visibility is tenant-wide)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_tags (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_contact_tags_tenant (tenant_id, id),
  INDEX idx_contact_tags_tenant_deleted (tenant_id, deleted_at),
  INDEX idx_contact_tags_tenant_name (tenant_id, name, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 2) Assignments (contact has many tags)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_tag_assignments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  contact_id BIGINT UNSIGNED NOT NULL,
  tag_id BIGINT UNSIGNED NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES contact_tags(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_cta_contact_tag (tenant_id, contact_id, tag_id),
  INDEX idx_cta_contact (tenant_id, contact_id, deleted_at),
  INDEX idx_cta_tag (tenant_id, tag_id, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 3) Migrate legacy free-text tag on contacts → master rows + assignments
-- ---------------------------------------------------------------------------
INSERT INTO contact_tags (tenant_id, name, created_by, updated_by)
SELECT DISTINCT c.tenant_id, TRIM(c.tag), NULL, NULL
FROM contacts c
WHERE c.tag IS NOT NULL AND TRIM(c.tag) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM contact_tags t
    WHERE t.tenant_id = c.tenant_id AND t.name = TRIM(c.tag) AND t.deleted_at IS NULL
  );

INSERT INTO contact_tag_assignments (tenant_id, contact_id, tag_id, created_by, updated_by)
SELECT c.tenant_id, c.id, t.id, NULL, NULL
FROM contacts c
INNER JOIN contact_tags t ON t.tenant_id = c.tenant_id AND t.name = TRIM(c.tag) AND t.deleted_at IS NULL
WHERE c.tag IS NOT NULL AND TRIM(c.tag) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM contact_tag_assignments a
    WHERE a.tenant_id = c.tenant_id AND a.contact_id = c.id AND a.tag_id = t.id
  );

-- ---------------------------------------------------------------------------
-- 4) Drop legacy column on contacts
-- ---------------------------------------------------------------------------
ALTER TABLE contacts DROP INDEX idx_contacts_tag;
ALTER TABLE contacts DROP COLUMN tag;
