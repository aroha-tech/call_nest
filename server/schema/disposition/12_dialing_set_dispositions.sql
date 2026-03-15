-- Dialing Set Dispositions (TENANT LEVEL) — maps tenant dispositions to dialing sets
-- Defines which dispositions belong to which dialing set for a tenant
-- order_index determines display/sorting order within a dialing set

CREATE TABLE IF NOT EXISTS dialing_set_dispositions (
  id CHAR(36) PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  dialing_set_id CHAR(36) NOT NULL,
  disposition_id CHAR(36) NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (dialing_set_id) REFERENCES dialing_sets(id) ON DELETE CASCADE,
  FOREIGN KEY (disposition_id) REFERENCES dispositions(id) ON DELETE CASCADE,

  UNIQUE KEY uk_dialing_set_disposition (dialing_set_id, disposition_id),

  INDEX idx_dialing_set_dispositions_tenant (tenant_id),
  INDEX idx_dialing_set_dispositions_set (dialing_set_id),
  INDEX idx_dialing_set_dispositions_disposition (disposition_id),
  INDEX idx_dialing_set_dispositions_order (dialing_set_id, order_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
