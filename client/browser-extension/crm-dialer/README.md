# Call Nest CRM Dialer Extension (MVP)

PhoneBurner-style browser extension that injects **Call** buttons on CRM pages and triggers the Call Nest Public Dialer API.

## Supported model (hardened v1)

- Works across CRM pages by detecting:
  - `tel:` links
  - phone-like text in common elements
- Auto-detects CRM code from hostname (Zoho, HubSpot, Salesforce, etc.); falls back to `generic_crm`.
- Uses the same public API contract as external CRM integrations.
- Enforces host allowlist (configurable in options).
- Stores runtime logs in extension local storage for troubleshooting.

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select folder: `client/browser-extension/crm-dialer`

## Configure

Open extension options and set:

- `API Base URL` (example: `http://localhost:4000`)
- `API Key` (from `/api/tenant/integrations/apps`)
- `Provider` (default `dummy`)
- `Default Country Code` (example `+91`)
- `Auto upsert contact before call` (recommended on)
- `Allow unknown CRM hosts` (off by default for safety)
- `Allowed host suffixes` (comma-separated allowlist)

## Runtime flow

1. User clicks injected **Call** button on CRM page
2. Extension optionally calls `/api/public/v1/dialer/contacts/upsert`
3. Extension calls `/api/public/v1/dialer/calls/click-to-call`
4. Call attempt is created in Call Nest

## Hardening included

- Duplicate button prevention using injection keys + sibling checks
- Host allowlist enforcement before dialing
- CRM-aware context extraction via adapters:
  - `zoho_crm`
  - `hubspot`
  - `salesforce`
  - `pipedrive`
  - `freshsales`
  - fallback `generic_crm`
- Toast feedback for success/failure
- Runtime log capture visible in Options page

## Adapter files

- `crmAdapters.js` contains CRM-specific extraction logic.
- `content.js` delegates contact name / external ID extraction to adapters.

## Adapter test harness

- Open extension popup and click **Run Adapter Inspector**.
- It displays:
  - detected `crmCode`
  - extracted `contactName`
  - extracted `externalContactId`
  - up to 20 phone candidates from the active tab
- Use this before calling to validate selector accuracy on each CRM page.

## Packaging

- See `PACKAGING.md` for zip packaging, enterprise install, and release steps.
