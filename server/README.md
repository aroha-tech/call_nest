# Call Nest Server — Backend API

Node.js + Express backend for Call Nest SaaS (calling + CRM).

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
  - Provider env quick refs:
    - Knowlarity: `KNOWLARITY_API_KEY`, `KNOWLARITY_AUTH_TOKEN`, `KNOWLARITY_K_NUMBER`, `KNOWLARITY_CALLER_ID` (`KNOWLARITY_API_URL` optional)
    - Ozonetel: `OZONETEL_API_KEY`, `OZONETEL_USERNAME`, `OZONETEL_AGENT_ID`, `OZONETEL_CAMPAIGN_NAME` (`OZONETEL_API_URL` optional)
    - MyOperator: `MYOPERATOR_API_URL`, `MYOPERATOR_AUTH_TOKEN` (+ optional `MYOPERATOR_AGENT_NUMBER`, `MYOPERATOR_CALLER_ID`)
  - Public webhook callbacks:
    - Exotel: `POST /api/public/telephony/exotel/status` (`EXOTEL_WEBHOOK_TOKEN`)
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
