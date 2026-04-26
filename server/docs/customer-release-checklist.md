# External CRM customer release checklist

Use this checklist before onboarding each new CRM customer.

## Account and access

- [ ] Tenant created and active.
- [ ] Integration app created under `Integrations` with correct scopes.
- [ ] API key shared securely one time (never in chat/email plaintext without expiry policy).
- [ ] Key rotation owner assigned on customer side.

## API connectivity

- [ ] Customer can call `POST /api/public/v1/dialer/contacts/upsert`.
- [ ] Customer can call `POST /api/public/v1/dialer/calls/click-to-call`.
- [ ] Customer can call lifecycle/writeback endpoints.
- [ ] 401/403 behavior validated with invalid key / missing scope.

## Telephony readiness

- [ ] `TELEPHONY_DEFAULT_PROVIDER` set correctly (`twilio` for real calls).
- [ ] Outbound call works with customer test numbers.
- [ ] Call status and attempt records appear in Call History.
- [ ] Fallback path verified (contact mapping + phone lookup).

## Extension rollout (if using browser dialer)

- [ ] Customer installed extension package.
- [ ] `baseUrl` and `apiKey` configured in options.
- [ ] Allowed host suffixes configured for customer CRM domains.
- [ ] Adapter inspector returns crmCode/contact/phone candidates on customer CRM pages.
- [ ] Click-to-call success shown in UI and app history.

## Observability and support

- [ ] Integration app request rate within plan limits.
- [ ] Outbox delivery logs visible and replay tested (if used).
- [ ] Escalation contact and SLA communicated.
- [ ] Customer provided support packet (OpenAPI + Postman + quickstart).

## Sign-off

- [ ] Internal QA sign-off
- [ ] Customer UAT sign-off
- [ ] Go-live date/time confirmed
- [ ] Post-launch monitoring window assigned (first 24–72 hours)
