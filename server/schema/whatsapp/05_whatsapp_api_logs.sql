-- API request/response logs for WhatsApp Business API calls
CREATE TABLE IF NOT EXISTS whatsapp_api_logs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  whatsapp_account_id BIGINT UNSIGNED NULL,
  direction ENUM('outbound','inbound') DEFAULT 'outbound',
  endpoint VARCHAR(255),
  method VARCHAR(20),
  request_body JSON,
  response_status INT,
  response_body JSON,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_whatsapp_api_logs_tenant_id (tenant_id),
  INDEX idx_whatsapp_api_logs_account_id (whatsapp_account_id),
  INDEX idx_whatsapp_api_logs_created_at (tenant_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
