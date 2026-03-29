# 🚀 Quick Start Guide

## Step 1: Setup Server Environment

1. Copy `.env.development.example` to `.env` in `server/` folder:
   ```bash
   cd server
   cp .env.development.example .env
   ```

2. Update `.env` with your values:
   ```env
   PORT=4000
   NODE_ENV=development
   JWT_SECRET=your-secret-change-in-production-min-32-chars
   JWT_REFRESH_SECRET=your-refresh-secret-change-in-production-min-32-chars
   JWT_ACCESS_EXPIRES_IN=15m
   JWT_REFRESH_EXPIRES_IN=7d
   
   # Database (choose one):
   # Option 1: DATABASE_URL
   DATABASE_URL=mysql://root:password@localhost:3306/call_nest
   
   # Option 2: Individual params
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=call_nest
   
   SUPER_ADMIN_EMAIL=admin@callnest.com
   SUPER_ADMIN_PASSWORD=ChangeMe123!
   ```

## Step 2: Setup Database

Run SQL files in order. **You're already in `server/schema` directory**, so skip the `cd` command.

### Option 1: MySQL Command Line (if mysql is in PATH)

**For PowerShell (Windows):**
```powershell
# You're already in server/schema, so just run:
Get-Content 00_bootstrap.sql | mysql -u root -p
Get-Content tenant/tenant.sql | mysql -u root -p call_nest
Get-Content tenant/01_seed_platform.sql | mysql -u root -p call_nest
Get-Content user/user.sql | mysql -u root -p call_nest
Get-Content user/refresh_token.sql | mysql -u root -p call_nest
```

**For Bash/Linux/Mac:**
```bash
mysql -u root -p < 00_bootstrap.sql
mysql -u root -p call_nest < tenant/tenant.sql
mysql -u root -p call_nest < tenant/01_seed_platform.sql
mysql -u root -p call_nest < user/user.sql
mysql -u root -p call_nest < user/refresh_token.sql
```

### Option 2: MySQL Command Line (Full Path - if mysql not in PATH)

Find your MySQL installation path (usually `C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe`):

```powershell
# Replace with your MySQL path
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p < 00_bootstrap.sql
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p call_nest < tenant/tenant.sql
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p call_nest < tenant/01_seed_platform.sql
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p call_nest < user/user.sql
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p call_nest < user/refresh_token.sql
```

### Option 3: MySQL Workbench (GUI - Easiest)

1. Open **MySQL Workbench**
2. Connect to your MySQL server
3. Open each SQL file:
   - File → Open SQL Script → Select `00_bootstrap.sql`
   - Click ⚡ Execute (or press Ctrl+Shift+Enter)
   - Repeat for: `tenant/tenant.sql`, `tenant/01_seed_platform.sql`, `user/user.sql`, `user/refresh_token.sql`
   - For files 2-5, make sure database `call_nest` is selected in dropdown

### Option 4: Node.js Script (Easiest - Recommended)

If you have Node.js set up, use the automated script:

```powershell
cd server
node scripts/setupDatabase.js
```

This script will:
- ✅ Test database connection
- ✅ Run all SQL files in correct order
- ✅ Show progress for each file
- ✅ Handle errors gracefully

### Option 5: phpMyAdmin (Web Interface)

1. Open phpMyAdmin in browser
2. Go to **SQL** tab
3. Copy content of each SQL file and paste, then click **Go**
4. Run files in order: `00_bootstrap.sql`, then `tenant/tenant.sql`, etc.

## Step 3: Seed Super Admin

```bash
cd server
node scripts/seedSuperAdmin.js
```

## Step 4: Start Server

```bash
cd server
npm install  # if not done already
npm run dev
```

Server should start on `http://localhost:4000`

## Step 5: Import Postman Collection

1. Open Postman
2. **Import Collection:**
   - Click **Import** → Select `Call Nest API.postman_collection.json`
3. **Import Environment:**
   - Click **Environments** → **Import** → Select `Call Nest - Local.postman_environment.json`
4. **Select Environment:**
   - Choose **"Call Nest - Local"** from dropdown (top right)

## Step 6: Test APIs

### Test Flow:

1. **Health Check** (`GET /health`)
   - Should return `{ "ok": true, ... }`

2. **Login** (`POST /api/auth/login`)
   - Use super admin credentials:
     - Email: `admin@callnest.com` (from `.env`)
     - Password: `ChangeMe123!` (from `.env`)
   - ✅ Tokens auto-saved to environment

3. **Register Tenant** (`POST /api/auth/register`)
   - Creates new company + admin
   - Use this admin to login and test admin features

4. **Register Agent** (`POST /api/auth/register-agent`)
   - Requires admin login first
   - Creates agent user

5. **Refresh Token** (`POST /api/auth/refresh`)
   - Get new access token when expired

6. **Logout** (`POST /api/auth/logout`)
   - Revoke refresh token

## ✅ Verification

After login, check environment variables:
- `access_token` should be set (auto-populated)
- `refresh_token` should be set (auto-populated)

All protected endpoints will automatically use `{{access_token}}` from environment.

## 🔧 Troubleshooting

**Server won't start:**
- Check MySQL is running
- Verify `.env` file exists and has correct DB credentials
- Check port 4000 is not in use

**Database connection error:**
- Verify MySQL credentials in `.env`
- Check database `call_nest` exists
- Run bootstrap SQL files

**401 Unauthorized:**
- Make sure you've logged in (tokens saved)
- Check environment is selected (top right)
- Try login again

**403 Forbidden:**
- Verify user role (admin needed for some endpoints)
- Check user/tenant is enabled in database
