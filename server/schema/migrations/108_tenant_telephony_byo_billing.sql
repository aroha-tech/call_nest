-- ============================================
-- Telephony: Bring-Your-Own provider accounts + credit / unlimited billing modes.
--
-- Goals:
--   * Each tenant can either ride on the platform default Exotel account (no BYO row), or
--     register their own Exotel SID/keys via tenant_telephony_accounts (BYO).
--   * Two call billing modes exist for every tenant: 'credit' or 'unlimited'.
--     'credit'    -> deduct paise-per-connected-minute from tenant_call_credit_wallet on
--                    every successful call (settled from provider webhook 'completed' event).
--     'unlimited' -> still records usage rows, but never debits the wallet (handled by the
--                    subscription plan).
--   * BYO tenants pay only a platform fee per connected minute (smaller rate); default-account
--     tenants pay the full call rate. Both rates have global defaults in platform_settings
--     and per-tenant overrides on the tenants table.
--   * Provider webhook deliveries must be routable to the correct tenant. Each BYO row has
--     a unique webhook_token (used in URL: /api/public/telephony/exotel/status/:token) and
--     we also store account_sid for fallback reverse lookup from the webhook payload.
--
-- Run:
--   mysql -u root -p call_nest < server/schema/migrations/108_tenant_telephony_byo_billing.sql
-- Or:
--   USE call_nest; source server/schema/migrations/108_tenant_telephony_byo_billing.sql;
-- ============================================

-- ---------- 1. platform_settings: global tunables for super-admin ----------
CREATE TABLE IF NOT EXISTS platform_settings (
  setting_key VARCHAR(120) NOT NULL,
  setting_value JSON NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO platform_settings (setting_key, setting_value)
SELECT 'telephony.default_call_rate_paise_per_minute', JSON_OBJECT('value', 100)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM platform_settings WHERE setting_key = 'telephony.default_call_rate_paise_per_minute'
);

INSERT INTO platform_settings (setting_key, setting_value)
SELECT 'telephony.default_byo_platform_fee_paise_per_minute', JSON_OBJECT('value', 25)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM platform_settings WHERE setting_key = 'telephony.default_byo_platform_fee_paise_per_minute'
);

INSERT INTO platform_settings (setting_key, setting_value)
SELECT 'telephony.default_call_min_balance_paise', JSON_OBJECT('value', 100)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM platform_settings WHERE setting_key = 'telephony.default_call_min_balance_paise'
);

-- ---------- 2. tenants: account mode + billing mode + per-tenant overrides ----------
ALTER TABLE tenants
  ADD COLUMN telephony_account_mode ENUM('default_account', 'byo_account') NOT NULL DEFAULT 'default_account'
    COMMENT 'default_account = use platform Exotel; byo_account = use tenant_telephony_accounts row'
    AFTER telephony_agent_leg_e164;

ALTER TABLE tenants
  ADD COLUMN call_billing_mode ENUM('credit', 'unlimited') NOT NULL DEFAULT 'credit'
    COMMENT 'credit = debit wallet per connected minute; unlimited = no debit (covered by subscription)'
    AFTER telephony_account_mode;

ALTER TABLE tenants
  ADD COLUMN call_rate_paise_per_minute_override INT UNSIGNED NULL
    COMMENT 'Override for default-account tenants. NULL = use platform_settings default.'
    AFTER call_billing_mode;

ALTER TABLE tenants
  ADD COLUMN byo_platform_fee_paise_per_minute_override INT UNSIGNED NULL
    COMMENT 'Override for byo_account tenants (platform fee). NULL = use platform_settings default.'
    AFTER call_rate_paise_per_minute_override;

ALTER TABLE tenants
  ADD COLUMN call_min_balance_paise_override INT UNSIGNED NULL
    COMMENT 'Minimum wallet balance required to start a new call. NULL = platform default.'
    AFTER byo_platform_fee_paise_per_minute_override;

-- ---------- 3. tenant_telephony_accounts: BYO provider credentials ----------
CREATE TABLE IF NOT EXISTS tenant_telephony_accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  provider_code VARCHAR(32) NOT NULL DEFAULT 'exotel',
  label VARCHAR(120) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_default TINYINT(1) NOT NULL DEFAULT 1,

  -- Identifier used by webhook payload reverse lookup (Exotel SID / Twilio AccountSid / etc).
  account_sid VARCHAR(120) NULL,

  -- Stored display numbers for this account (preferred over tenants.telephony_* when present).
  caller_id_e164 VARCHAR(32) NULL,
  agent_leg_e164 VARCHAR(32) NULL,

  -- Encrypted credentials (AES-256-GCM, see server/src/utils/secretCrypto.js).
  credentials_ciphertext MEDIUMTEXT NOT NULL,
  credentials_iv VARCHAR(64) NOT NULL,
  credentials_tag VARCHAR(64) NOT NULL,

  -- Hint for UI (e.g. last 4 chars of api token).
  credentials_hint VARCHAR(120) NULL,

  -- Per-tenant webhook routing token (URL: /api/public/telephony/<provider>/status/:webhook_token).
  webhook_token CHAR(48) NOT NULL,

  -- Optional override of the status callback URL we tell the provider to call back.
  status_callback_url VARCHAR(512) NULL,

  last_used_at DATETIME NULL,

  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,

  PRIMARY KEY (id),
  UNIQUE KEY uq_tta_webhook_token (webhook_token),
  KEY idx_tta_tenant_active (tenant_id, is_active, deleted_at),
  KEY idx_tta_account_sid (account_sid),
  KEY idx_tta_provider (provider_code, deleted_at),
  CONSTRAINT fk_tta_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_tta_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tta_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tta_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 4. tenant_call_credit_wallet: current balance ----------
CREATE TABLE IF NOT EXISTS tenant_call_credit_wallet (
  tenant_id BIGINT UNSIGNED NOT NULL,
  balance_paise BIGINT NOT NULL DEFAULT 0
    COMMENT 'Signed: can go briefly negative if a settle slips past balance; UI should block earlier.',
  lifetime_topup_paise BIGINT UNSIGNED NOT NULL DEFAULT 0,
  lifetime_spent_paise BIGINT UNSIGNED NOT NULL DEFAULT 0,
  last_topup_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id),
  CONSTRAINT fk_wallet_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 5. tenant_call_credit_ledger: append-only audit trail ----------
CREATE TABLE IF NOT EXISTS tenant_call_credit_ledger (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  call_attempt_id BIGINT UNSIGNED NULL,
  entry_type ENUM(
    'topup',
    'debit_call',
    'adjustment_credit',
    'adjustment_debit',
    'refund'
  ) NOT NULL,
  /** Signed: positive for credits, negative for debits. */
  amount_paise BIGINT NOT NULL,
  balance_after_paise BIGINT NOT NULL,
  /** Optional: how many billed minutes this entry represents (debit_call only). */
  unit_qty INT UNSIGNED NULL,
  /** Optional: rate snapshot in paise per unit (debit_call only). */
  unit_rate_paise INT UNSIGNED NULL,
  note VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ledger_tenant_created (tenant_id, created_at),
  KEY idx_ledger_call (call_attempt_id),
  CONSTRAINT fk_ledger_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_ledger_attempt FOREIGN KEY (call_attempt_id) REFERENCES contact_call_attempts(id) ON DELETE SET NULL,
  CONSTRAINT fk_ledger_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 6. contact_call_attempts: billing fields per attempt ----------
ALTER TABLE contact_call_attempts
  ADD COLUMN tenant_telephony_account_id BIGINT UNSIGNED NULL
    COMMENT 'Set when the call rode on a BYO account; NULL means the platform default account.'
    AFTER provider;

ALTER TABLE contact_call_attempts
  ADD COLUMN billing_mode_at_call ENUM('credit', 'unlimited') NULL
    COMMENT 'Snapshot of tenants.call_billing_mode at the time the call started.'
    AFTER tenant_telephony_account_id;

ALTER TABLE contact_call_attempts
  ADD COLUMN billed_unit_qty INT UNSIGNED NULL
    COMMENT 'Billed minutes (ceil) used to compute billed_paise.'
    AFTER billing_mode_at_call;

ALTER TABLE contact_call_attempts
  ADD COLUMN billed_unit_rate_paise INT UNSIGNED NULL
    COMMENT 'Snapshot of the rate applied at settlement.'
    AFTER billed_unit_qty;

ALTER TABLE contact_call_attempts
  ADD COLUMN billed_paise INT UNSIGNED NULL
    COMMENT 'Total paise debited from wallet for this attempt (NULL until settled).'
    AFTER billed_unit_rate_paise;

ALTER TABLE contact_call_attempts
  ADD COLUMN billed_at DATETIME NULL
    COMMENT 'Set when settlement ran. Idempotent: settle ignores rows where this is non-null.'
    AFTER billed_paise;

ALTER TABLE contact_call_attempts
  ADD KEY idx_cca_tenant_account (tenant_telephony_account_id);

ALTER TABLE contact_call_attempts
  ADD CONSTRAINT fk_cca_telephony_account FOREIGN KEY (tenant_telephony_account_id)
    REFERENCES tenant_telephony_accounts(id) ON DELETE SET NULL;
