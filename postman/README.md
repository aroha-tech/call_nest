# Postman Collection for Call Nest API

Ready-to-import Postman collection and environment files for testing Call Nest API.

## 📁 Files

- **`Call Nest API.postman_collection.json`** - Main API collection with all endpoints
- **`Call Nest - Local.postman_environment.json`** - Local development environment
- **`Call Nest - Production.postman_environment.json`** - Production environment template

## 🚀 Quick Start

### 1. Import Collection

1. Open Postman
2. Click **Import** button (top left)
3. Select **`Call Nest API.postman_collection.json`**
4. Click **Import**

### 2. Import Environment

1. Click **Environments** (left sidebar)
2. Click **Import**
3. Select **`Call Nest - Local.postman_environment.json`**
4. Click **Import**
5. Select **"Call Nest - Local"** from environment dropdown (top right)

### 3. Update Environment Variables

Edit environment variables if needed:
- `base_url` - API base URL (default: `http://localhost:4000`)
- `test_email` - Test user email (default: super admin email)
- `test_password` - Test user password
- `access_token` - Auto-set after login (don't edit manually)
- `refresh_token` - Auto-set after login (don't edit manually)

## 📋 API Endpoints

### Auth Endpoints

#### 1. Register Tenant + Admin
- **Method:** `POST`
- **URL:** `/api/auth/register`
- **Body:**
  ```json
  {
    "tenantName": "Acme Corporation",
    "tenantSlug": "acme-corp",
    "email": "admin@acme.com",
    "password": "SecurePass123",
    "name": "John Admin"
  }
  ```

#### 2. Login
- **Method:** `POST`
- **URL:** `/api/auth/login`
- **Body:**
  ```json
  {
    "email": "admin@callnest.com",
    "password": "ChangeMe123!"
  }
  ```
- **Auto-saves:** `access_token` and `refresh_token` to environment

#### 3. Refresh Token
- **Method:** `POST`
- **URL:** `/api/auth/refresh`
- **Body:**
  ```json
  {
    "refreshToken": "{{refresh_token}}"
  }
  ```
- **Auto-updates:** `access_token` in environment

#### 4. Register Agent
- **Method:** `POST`
- **URL:** `/api/auth/register-agent`
- **Auth:** Bearer Token (requires admin role)
- **Body:**
  ```json
  {
    "email": "agent@acme.com",
    "password": "AgentPass123",
    "name": "Jane Agent"
  }
  ```

#### 5. Logout
- **Method:** `POST`
- **URL:** `/api/auth/logout`
- **Auth:** Bearer Token
- **Body:**
  ```json
  {
    "refreshToken": "{{refresh_token}}"
  }
  ```

### Health Check

#### Health Check
- **Method:** `GET`
- **URL:** `/health`
- **No auth required**

## 🔄 Testing Flow

1. **Start Server**
   ```bash
   cd server
   npm run dev
   ```

2. **Health Check** - Verify server is running

3. **Register Tenant** - Create a new tenant + admin (or use super admin)

4. **Login** - Get access + refresh tokens (auto-saved)

5. **Register Agent** - Create agent (requires admin login)

6. **Refresh Token** - Get new access token when expired

7. **Logout** - Revoke refresh token

## 🔐 Environment Variables

### Local Environment
- `base_url`: `http://localhost:4000`
- `test_email`: Super admin email (from `.env`)
- `test_password`: Super admin password (from `.env`)

### Production Environment
- Update `base_url` to your production API URL
- Update credentials as needed

## 📝 Notes

- **Auto Token Management:** Login and Refresh endpoints automatically save tokens to environment
- **Bearer Auth:** Protected endpoints use `{{access_token}}` automatically
- **Environment Selection:** Make sure correct environment is selected (top right dropdown)

## 🐛 Troubleshooting

**401 Unauthorized:**
- Check if `access_token` is set in environment
- Try logging in again to refresh tokens

**403 Forbidden:**
- Verify user role (admin required for register-agent)
- Check if user/tenant is enabled

**Connection Error:**
- Verify server is running on `{{base_url}}`
- Check `base_url` in environment variables
