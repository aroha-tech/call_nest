-- Default Dialing Set Dispositions (GLOBAL) — maps dispositions to dialing sets
-- Super admin manages these; defines which dispositions belong to which dialing set
-- order_index determines display/sorting order within a dialing set

CREATE TABLE IF NOT EXISTS default_dialing_set_dispositions (
  id CHAR(36) PRIMARY KEY,
  default_dialing_set_id CHAR(36) NOT NULL,
  default_disposition_id CHAR(36) NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (default_dialing_set_id) REFERENCES default_dialing_sets(id) ON DELETE CASCADE,
  FOREIGN KEY (default_disposition_id) REFERENCES default_dispositions(id) ON DELETE CASCADE,

  UNIQUE KEY uk_dialing_set_disposition (default_dialing_set_id, default_disposition_id),

  INDEX idx_dialing_set_dispositions_set (default_dialing_set_id),
  INDEX idx_dialing_set_dispositions_disposition (default_disposition_id),
  INDEX idx_dialing_set_dispositions_order (default_dialing_set_id, order_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
