# Production readiness — Dialer SaaS (API + browser extension)

Use this checklist before giving the dialer to external CRM customers or shipping the extension broadly.

## 1. Security

- **API keys**: Store only hashes server-side; show full key once on create/rotate. Document key rotation and revocation.
- **Scopes**: Default least-privilege scopes; document `*` wildcard only for internal/testing.
- **Rate limiting**: Tune `requests_per_minute` per plan; monitor 429s.
- **Host allowlist (extension)**: Keep `allowUnknownCrmHosts` off in production; maintain explicit `allowedHostSuffixes` per customer or ship a preset list.
- **CORS / API base URL**: Production API must use HTTPS; extension `baseUrl` must match your public API origin.
- **Secrets**: Never commit API keys; use env-specific docs for ops only.
- **Webhook signatures**: Document `x-callnest-signature` (HMAC) for outbound events; customers verify server-side.

## 2. Database and migrations

- Run all dialer integration migrations in order on production:
  - `081_public_dialer_integration_core.sql`
  - `082_public_dialer_events_usage.sql`
  - `083_lead_integrations_connector_metadata.sql`
- Backup before migrate; verify `integration_apps`, `integration_entity_mappings`, `integration_event_outbox` exist.

## 3. API contract and docs

- Publish **Public Dialer API v1**:
  - OpenAPI: `server/docs/openapi/public-dialer-v1.openapi.yaml`
  - Postman: `server/docs/postman/public-dialer-v1.postman_collection.json`
  - Quickstart: `server/docs/postman/public-dialer-v1-quickstart.md`
- Version policy: breaking changes → `/v2`; deprecate with timeline in responses/docs.

## 4. Telephony

- Replace `dummy` provider with real provider (Twilio/Exotel/etc.) in production.
- Test: outbound call, status callbacks, recording URLs, lifecycle updates to `contact_call_attempts`.

## 5. Browser extension (CRM dialer)

- **Manifest**: Bump `version`; set final `name` / `description` for store or enterprise sideload.
- **Permissions**: Prefer narrowing `host_permissions` to known CRM patterns if you stop supporting “any site.”
- **Distribution**:
  - **Enterprise**: signed CRX / policy install, or continue **Load unpacked** for internal pilots.
  - **Chrome Web Store**: requires listing assets, privacy policy, single purpose description, and often narrower host access.
- **Updates**: Document how customers get new builds (zip + reload vs store auto-update).
- **Support bundle**: Extension options logs + adapter inspector output for first-line support.

## 6. Observability and operations

- Monitor: public API 4xx/5xx, outbox `failed`/`dead`, webhook delivery table growth.
- Alerts: spike in `dial.failed`, auth failures, DB errors on integration tables.
- Runbook: rotate key, disable app (`integration_apps.is_active`), replay outbox (when supported in UI).

## 7. Billing and limits (when ready)

- Meter: `tenant_billing_usage_daily` (e.g. `api_calls_started`); extend for minutes/agents if needed.
- Enforce plan limits in middleware or service layer before expensive operations.

## 8. Legal and trust

- Data processing: what PII flows (phone, name, CRM IDs); subprocessors; retention.
- Extension privacy: what runs in page context; no exfiltration beyond your API URLs in policy.

## 9. Pre-launch smoke test (15 minutes)

1. Create integration app; copy API key once.
2. Postman: upsert contact → click-to-call → optional lifecycle/writeback.
3. Extension: load unpacked → options (HTTPS base URL, key, allowlist) → inspector → Call → verify call history in app.
4. Revoke/rotate key; confirm old key returns 401.

## 10. Customer handoff pack (minimum)

- API base URL + link to OpenAPI/Postman/quickstart.
- How to create app + scopes.
- Extension folder or store link + options screenshot.
- Support email and escalation path for integration failures.
