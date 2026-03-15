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
Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

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
