-- Call scripts: one per tenant can be default. First created is default; default cannot be deleted.
ALTER TABLE call_scripts
  ADD COLUMN is_default TINYINT(1) NOT NULL DEFAULT 0 AFTER status;

-- Set earliest script per tenant as default (for existing data)
UPDATE call_scripts c
INNER JOIN (
  SELECT tenant_id, MIN(id) AS first_id
  FROM call_scripts
  WHERE is_deleted = 0
  GROUP BY tenant_id
) first ON first.tenant_id = c.tenant_id AND first.first_id = c.id
SET c.is_default = 1
WHERE c.is_deleted = 0;

-- Index for finding default script per tenant
CREATE INDEX idx_call_scripts_tenant_default ON call_scripts (tenant_id, is_deleted, is_default);
