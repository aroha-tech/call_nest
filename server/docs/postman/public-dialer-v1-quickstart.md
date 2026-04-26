# Public Dialer API Quickstart (v1)

This quickstart helps your team test the Public Dialer API v1 flow in a few minutes.

## 0) Prerequisites

- Backend running (`http://localhost:4000` by default)
- SQL migrations applied:
  - `server/schema/migrations/081_public_dialer_integration_core.sql`
  - `server/schema/migrations/082_public_dialer_events_usage.sql`
  - `server/schema/migrations/083_lead_integrations_connector_metadata.sql`
- Tenant admin access in UI

## 1) Create integration app key (tenant admin)

Use UI:
- Open Integrations page
- Create a Public CRM API app
- Copy generated API key

Or API (tenant-authenticated):

`POST /api/tenant/integrations/apps`

```json
{
  "name": "CRM Production",
  "provider_code": "generic_crm",
  "scopes": ["contacts.write", "calls.write", "events.read", "activities.write"]
}
```

Save the returned `data.api_key` as your `x-api-key`.

## 2) Upsert one contact from CRM

`POST /api/public/v1/dialer/contacts/upsert`

Headers:
- `x-api-key: <your_api_key>`
- `Content-Type: application/json`

Body:

```json
{
  "external_crm": "generic_crm",
  "default_country_code": "+91",
  "contacts": [
    {
      "external_id": "crm-contact-001",
      "display_name": "John Demo",
      "phone": "+919900000000",
      "email": "john@example.com",
      "notes": "Imported from CRM quickstart"
    }
  ]
}
```

Expected:
- HTTP `201`
- `{ "ok": true, "data": ... }`

## 3) Start click-to-call for that contact

`POST /api/public/v1/dialer/calls/click-to-call`

Headers:
- `x-api-key: <your_api_key>`
- `Content-Type: application/json`

Body:

```json
{
  "external_crm": "generic_crm",
  "external_contact_id": "crm-contact-001",
  "provider": "exotel",
  "notes": "Quickstart click to call"
}
```

Expected:
- HTTP `201`
- `{ "ok": true, "data": { "id": <call_attempt_id>, ... } }`

## Optional next checks

- Push lifecycle:
  - `POST /api/public/v1/dialer/calls/lifecycle`
- Write notes/disposition:
  - `POST /api/public/v1/dialer/activities/writeback`
- Process and inspect outbound events:
  - `POST /api/public/v1/dialer/events/process`
  - `GET /api/public/v1/dialer/events/deliveries?limit=50`

## Internal Connector (JWT) quick test

Use this when your own CRM calls the same centralized dialer integration core through tenant-auth routes.

Required header:
- `Authorization: Bearer <tenant_jwt>`

Endpoints:
- `POST /api/tenant/integrations/internal-crm/contacts/upsert`
- `POST /api/tenant/integrations/internal-crm/calls/click-to-call`
- `POST /api/tenant/integrations/internal-crm/calls/lifecycle`
- `POST /api/tenant/integrations/internal-crm/activities/writeback`

This path is functionally aligned with the public connector flow; only auth mode differs (JWT vs API key).

## Exotel status callback endpoint

Use this public endpoint for Exotel call status updates:

- `POST /api/public/telephony/exotel/status`

Expected payload fields (any compatible subset):
- `CallSid` (or `CallUUID`) as provider call id
- `CallStatus`/`Status`/`DialCallStatus`
- `CallDuration` (optional)

Optional security:
- Set `EXOTEL_WEBHOOK_TOKEN` in server env
- Send same value in header: `x-exotel-token`

## Knowlarity and Ozonetel status callbacks

Use these public endpoints for provider lifecycle updates:

- `POST /api/public/telephony/knowlarity/status`
- `POST /api/public/telephony/ozonetel/status`

Expected payload fields (any compatible subset):
- Provider call id:
  - Knowlarity: `call_id`/`CallSid`/`ucid`
  - Ozonetel: `ucid`/`call_id`/`CallSid`
- Status: `status`/`call_status`/`CallStatus`
- Optional duration: `duration`/`call_duration`/`CallDuration`

Optional security:
- `KNOWLARITY_WEBHOOK_TOKEN` with header `x-knowlarity-token`
- `OZONETEL_WEBHOOK_TOKEN` with header `x-ozonetel-token`

## Browser extension (multi-CRM, PhoneBurner-style) MVP

Extension path:
- `client/browser-extension/crm-dialer`

What it does:
- Injects **Call** buttons on phone numbers in CRM pages
- Supports many CRMs via hostname detection (`zoho`, `hubspot`, `salesforce`, etc.)
- Uses the same public endpoints:
  - `POST /api/public/v1/dialer/contacts/upsert`
  - `POST /api/public/v1/dialer/calls/click-to-call`

## Postman import

- Collection: `server/docs/postman/public-dialer-v1.postman_collection.json`
- Set variables:
  - `baseUrl`
  - `apiKey`
  - `tenantJwt`
  - `callAttemptId`
  - `providerCallId`
  - `outboxId`
  - `zohoContactId`
