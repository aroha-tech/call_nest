-- ============================================
-- Campaigns Table (Per Tenant)
-- Supports:
-- - static: store campaign_id on contacts
-- - filter: contacts are fetched dynamically via filters_json
-- ============================================

CREATE TABLE IF NOT EXISTS campaigns (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,

  name VARCHAR(255) NOT NULL,

  type ENUM('static','filter') NOT NULL DEFAULT 'static',

  -- Manager responsible for this campaign
  manager_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NULL,

  -- For filter campaigns: JSON rules like { "source": "...", "status_id": "..." }
  filters_json JSON NULL,

  status ENUM('active','paused') NOT NULL DEFAULT 'active',

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,

  INDEX idx_campaigns_tenant (tenant_id, id),
  INDEX idx_campaigns_manager (tenant_id, manager_id),
  INDEX idx_campaigns_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

