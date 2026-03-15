-- Log of WhatsApp messages sent via API
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  whatsapp_account_id BIGINT UNSIGNED NULL,
  contact_id BIGINT UNSIGNED NULL,
  phone VARCHAR(20),
  template_id BIGINT UNSIGNED NULL,
  message_text TEXT,
  provider_message_id VARCHAR(150),
  status ENUM('pending','sent','delivered','read','failed') DEFAULT 'pending',
  sent_at TIMESTAMP NULL,
  delivered_at TIMESTAMP NULL,
  read_at TIMESTAMP NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_whatsapp_messages_tenant_id (tenant_id),
  INDEX idx_whatsapp_messages_contact_id (contact_id),
  INDEX idx_whatsapp_messages_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
