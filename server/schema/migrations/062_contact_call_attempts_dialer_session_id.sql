-- Persist dialer session id on call attempts for faster call history queries.
-- Run: mysql -u root -p call_nest < server/schema/migrations/062_contact_call_attempts_dialer_session_id.sql

ALTER TABLE contact_call_attempts
  ADD COLUMN dialer_session_id BIGINT UNSIGNED NULL AFTER manager_id,
  ADD KEY idx_cca_tenant_dialer_created (tenant_id, dialer_session_id, created_at);

-- Backfill dialer_session_id from dialer_session_items (newest match wins).
UPDATE contact_call_attempts cca
SET cca.dialer_session_id = (
  SELECT dsi.session_id
  FROM dialer_session_items dsi
  WHERE dsi.tenant_id = cca.tenant_id
    AND dsi.last_attempt_id = cca.id
  ORDER BY dsi.id DESC
  LIMIT 1
)
WHERE cca.dialer_session_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM dialer_session_items dsi2
    WHERE dsi2.tenant_id = cca.tenant_id
      AND dsi2.last_attempt_id = cca.id
  );

