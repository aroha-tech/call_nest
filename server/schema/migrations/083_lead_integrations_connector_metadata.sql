USE call_nest;

ALTER TABLE lead_integrations
  ADD COLUMN provider_type VARCHAR(64) NULL AFTER provider_code,
  ADD COLUMN connector_config_json JSON NULL AFTER tokens_json;
