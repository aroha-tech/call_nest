# CallXTime Server — Backend API

Node.js + Express backend for CallXTime (calling + CRM).

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Database Setup
Run SQL files in order:
```bash
# From server/schema/ directory
mysql -u root -p < 00_bootstrap.sql
mysql -u root -p call_nest < tenant/tenant.sql
mysql -u root -p call_nest < tenant/01_seed_platform.sql
mysql -u root -p call_nest < user/user.sql
```

### 3. Environment Variables
Copy `.env.development.example` to `.env` and configure:
```bash
cp .env.development.example .env
```
For production, use `.env.production.example` (see comments inside that file).

Update:
- `DB_PASSWORD` — your MySQL password
- `JWT_SECRET` — strong secret (min 32 chars)
- `SUPER_ADMIN_EMAIL` — super admin email
- `SUPER_ADMIN_PASSWORD` — super admin password

### 4. Seed Super Admin
```bash
node scripts/seedSuperAdmin.js
```

### 5. Start Server
```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

Server runs on `http://localhost:4000`

## API Endpoints

### Public
- `POST /api/auth/register` — Register tenant + admin
- `POST /api/auth/login` — Login user

### Protected (require Bearer token)
- `POST /api/auth/register-agent` — Register agent (admin only)

## Public Dialer API v1

- OpenAPI (v1): `server/docs/openapi/public-dialer-v1.openapi.yaml`
- Postman collection (v1): `server/docs/postman/public-dialer-v1.postman_collection.json`
- Quickstart: `server/docs/postman/public-dialer-v1-quickstart.md`
- Base path: `/api/public/v1/dialer`
- Auth: API key in header `x-api-key`
- Internal connector (JWT) paths:
  - `/api/tenant/integrations/internal-crm/contacts/upsert`
  - `/api/tenant/integrations/internal-crm/calls/click-to-call`
  - `/api/tenant/integrations/internal-crm/calls/lifecycle`
  - `/api/tenant/integrations/internal-crm/activities/writeback`
- Production readiness (security, extension, launch): `server/docs/production-readiness-dialer-saas.md`
- Customer go-live checklist: `server/docs/customer-release-checklist.md`
- Telephony providers (default + supported codes):
  - Default: `TELEPHONY_DEFAULT_PROVIDER=exotel`
  - Built-in codes: `exotel`, `twilio`, `knowlarity`, `myoperator`, `ozonetel`, `dummy`
  - Per-tenant Bring-Your-Own (BYO) Exotel accounts are managed via:
    - Tenant admin UI: `GET/POST/PATCH/DELETE /api/tenant/telephony-accounts`
    - Super admin: `GET/PATCH /api/admin/tenant-telephony/:tenant_id/billing` (rate, BYO fee, min balance, modes)
  - Provider credentials are encrypted at rest with AES-256-GCM. Set `APP_ENCRYPTION_KEY`
    (32 bytes, base64 or hex; generate with `openssl rand -base64 32`).
  - Two call billing modes per tenant (`tenants.call_billing_mode`): `credit` (debit wallet
    per connected minute) or `unlimited` (no debit; subscription-covered). Defaults:
    - `telephony.default_call_rate_paise_per_minute` (default-account tenants)
    - `telephony.default_byo_platform_fee_paise_per_minute` (BYO tenants)
    - `telephony.default_call_min_balance_paise` (block calls if balance < this)
    All three are stored in `platform_settings` and overridable per-tenant.
  - Provider env quick refs:
    - Knowlarity: `KNOWLARITY_API_KEY`, `KNOWLARITY_AUTH_TOKEN`, `KNOWLARITY_K_NUMBER`, `KNOWLARITY_CALLER_ID` (`KNOWLARITY_API_URL` optional)
    - Ozonetel: `OZONETEL_API_KEY`, `OZONETEL_USERNAME`, `OZONETEL_AGENT_ID`, `OZONETEL_CAMPAIGN_NAME` (`OZONETEL_API_URL` optional)
    - MyOperator: `MYOPERATOR_API_URL`, `MYOPERATOR_AUTH_TOKEN` (+ optional `MYOPERATOR_AGENT_NUMBER`, `MYOPERATOR_CALLER_ID`)
  - Public webhook callbacks:
    - Exotel (platform default): `POST /api/public/telephony/exotel/status` (`EXOTEL_WEBHOOK_TOKEN`)
    - Exotel (per-tenant BYO): `POST /api/public/telephony/exotel/status/:tenant_token`
      (tenant_token is unique per BYO account; the API auto-builds this URL and feeds it to
      Exotel as `StatusCallback` so webhook routing back to the right tenant always works.)
    - Knowlarity: `POST /api/public/telephony/knowlarity/status` (`KNOWLARITY_WEBHOOK_TOKEN`)
    - Ozonetel: `POST /api/public/telephony/ozonetel/status` (`OZONETEL_WEBHOOK_TOKEN`)

## Project Structure

```
server/
├── src/
│   ├── config/        # DB, env config
│   ├── controllers/   # HTTP handlers
│   ├── middleware/    # Auth, tenant guard, error handler
│   ├── routes/        # Route definitions
│   ├── services/      # Business logic
│   ├── utils/         # Reusable helpers
│   └── app.js         # Entry point
├── schema/            # SQL schemas by domain
├── scripts/           # Utility scripts
└── package.json
```

## Multi-tenancy

- All tenant-scoped tables have `tenant_id`
- Middleware extracts `tenant_id` from JWT
- All queries automatically filter by `tenant_id`
- Super admin (`tenant_id=1`) can access all tenants
