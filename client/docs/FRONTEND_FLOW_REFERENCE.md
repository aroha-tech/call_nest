# Call Nest — Frontend Flow & Reference (Start to End)

Use this as a **book-style reference** for what the frontend does and where the logic lives. Everything below is what is **already implemented** as of this doc.

---

## 1. App bootstrap (entry → routes)

**Order of execution:**

1. **`index.html`**  
   - Loads the root `<div id="root">` and the script `src/main.jsx`.

2. **`src/main.jsx`**  
   - Creates Redux `store`.  
   - Wires axios token getters to Redux (`store.subscribe` so `accessToken` / `refreshToken` come from `state.auth`).  
   - Renders the app with this **wrapper order** (inner to outer):  
     `App` → `BrowserRouter` → **`TenantProvider`** → `Provider` (Redux) → `StrictMode`.  
   - Imports global styles `global.scss`.

3. **`src/App.jsx`**  
   - Renders **`DevTenantBanner`** (dev-only, bottom of screen).  
   - Renders **`<Routes><Route path="/*" element={<AppRoutes />} /></Routes>`**.  
   - So all paths go to `AppRoutes`.

4. **`src/routes/AppRoutes.jsx`**  
   - Calls **`useTenant()`** (from `TenantContext`).  
   - Chooses which **route set** to render based on domain type:  
     - **Marketing** → `MarketingRoutes`  
     - **Platform** → `PlatformRoutes`  
     - **Tenant** (or dev fallback) → `TenantRoutes`  
   - Each route set is a different `<Routes>…</Routes>` tree (auth pages, protected app shell, etc.).

**Takeaway:** Domain type is decided once via `TenantContext`; routing is just “which set of routes to show.”

---

## 2. Multi-tenant domain detection (subdomain-based)

**Purpose:** Know if we’re on **marketing**, **platform admin**, or **tenant app** — for **routing and UI only**. Security and tenant resolution are done on the **backend** from the request host.

### 2.1 Domain rules

| Hostname              | Meaning        | `tenantSlug` | `isMarketing` | `isPlatform` | `isTenant` |
|-----------------------|----------------|--------------|---------------|--------------|------------|
| `www.arohva.com`      | Marketing      | `null`       | `true`        | `false`      | `false`    |
| `admin.arohva.com`    | Platform admin | `"platform"` | `false`       | `true`       | `false`    |
| `acme.arohva.com`     | Tenant app     | `"acme"`     | `false`       | `false`      | `true`     |
| `localhost` (no override) | Dev fallback | `null`       | `false`       | `false`      | `false` → still gets **TenantRoutes** |
| `localhost` + `dev_tenant=acme`   | Simulate tenant  | `"acme"`  | `false`       | `false`      | `true`     |
| `localhost` + `dev_tenant=platform` | Simulate platform | `"platform"` | `false` | `true`  | `false`     |

### 2.2 Where the logic lives

- **`src/utils/tenantResolver.js`**  
  - **Pure helpers** (no React):  
    - `getHostname()` — `window.location.hostname` (or `""` if no `window`).  
    - `getSubdomain()` — returns tenant slug or `"platform"` or `null`; on localhost, reads `localStorage["dev_tenant"]` first.  
    - `isPlatformAdminDomain()`, `isMarketingDomain()`, `isTenantDomain()`, `isLocalDevelopment()`.  
  - Constants: `PLATFORM_ADMIN_HOST = 'admin.arohva.com'`, `MARKETING_HOST = 'www.arohva.com'`, `DEV_TENANT_KEY = 'dev_tenant'`.

- **`src/context/TenantContext.jsx`**  
  - **`TenantProvider`** — calls the resolver once in `useMemo`, provides:  
    `tenantSlug`, `isPlatform`, `isTenant`, `isMarketing`.  
  - **`useTenant()`** — any component can read that context.

**Important:** Frontend never sends `tenant_id` in API body. Backend resolves tenant from the **request host (subdomain)**. Frontend tenant is for **routing and UI only**.

---

## 3. Route sets (what each domain sees)

All live in **`src/routes/AppRoutes.jsx`**.

- **MarketingRoutes**  
  - `AuthLayout` with `/login`, `/register` (public only).  
  - `/` → `HomePage` (no auth required).  
  - Catch-all → redirect to `/`.

- **TenantRoutes** (and **PlatformRoutes** currently reuse this)  
  - Same auth routes under `AuthLayout`: `/login`, `/register`.  
  - Protected app: wrapped in **`ProtectedRoute`** then **`AppShellLayout`**; inside, `/` → `HomePage`.  
  - Catch-all → redirect to `/`.

- **ProtectedRoute**  
  - If not authenticated → `<Navigate to="/login" replace />`.  
  - Otherwise renders `children`.

- **PublicOnlyRoute**  
  - If authenticated → `<Navigate to="/" replace />`.  
  - Otherwise renders `children`.

**Decision in `AppRoutes`:**  
`useTenant()` → if `isMarketing` → MarketingRoutes; else if `isPlatform` → PlatformRoutes; else if `isTenant` → TenantRoutes; **else (e.g. localhost)** → **TenantRoutes** so dev always has an app.

---

## 4. Auth flow (login / register / tokens)

- **Redux:** `src/features/auth/authSlice.js`  
  - State: `user`, `tenant`, `tenantSlug`, `accessToken`, `refreshToken`, `isAuthenticated`, `loading`, `error`.  
  - **loginSuccess:** can receive `tenantSlug` from API; else falls back to `tenant?.slug` or `getSubdomain()`.  
  - **logout:** clears all of the above.

- **Selectors:** `src/features/auth/authSelectors.js`  
  - `selectUser`, `selectTenant`, **`selectTenantSlug`**, `selectIsAuthenticated`, etc.

- **API:** `src/features/auth/authAPI.js`  
  - Login/register/refresh/logout call **`axiosInstance`** (same origin, no tenant in path/body from frontend).

- **Axios:** `src/services/axiosInstance.js`  
  - **baseURL = `window.location.origin`** (no hardcoded tenant).  
  - Request interceptor: adds `Authorization: Bearer <accessToken>` from Redux.  
  - Response interceptor: on 401, calls refresh endpoint; on success updates tokens via `window.__authStore.dispatch`; on failure dispatches logout.

**Takeaway:** Tokens live in Redux (memory). Axios reads them via getters set in `main.jsx`. Backend decides tenant from host.

---

## 5. Design system & theming

- **`src/styles/variables.scss`**  
  - SCSS variables: spacing, radius, typography, primary/neutral/semantic colors.  
  - **`:root`** block defines **CSS custom properties** (e.g. `--color-primary-600`, `--color-bg-body`, `--color-text-primary`).  
  - **Rebrand:** change only the “Primary (brand)” section and optionally surface/background tokens; components use these variables so one place controls the look.

- **`src/styles/global.scss`**  
  - Resets, `body` font/colors from tokens, `#root` min-height, link/button/input base styles.

- **Components** (e.g. `Button`, `Input`, `Card`, `Alert`)  
  - Use `var(--color-*)` and SCSS variables so they stay consistent and rebrandable.

---

## 6. App shell & sales navigation

- **`src/layouts/AppShellLayout.jsx`**  
  - Sidebar: brand, tenant/platform label, nav items from **`useSalesNavigation()`**.  
  - Top bar: title area + “New lead” (primary) + “Settings” (ghost).  
  - Main content: `children` (e.g. `HomePage`).

- **`src/hooks/useSalesNavigation.js`**  
  - **items:** Dashboard, Leads, Contacts, Deals, Activities, Reports, Settings (key, label, path).  
  - **activeKey** from current path.  
  - **goTo(key)** to navigate.  
  - Also exposes `tenantSlug`, `isPlatform` from `useTenant()`.

- **`src/layouts/AppShellLayout.module.scss`**  
  - Shell layout, sidebar, nav, topbar, content area using design tokens.

---

## 7. Development helpers

- **Dev tenant override (localhost):**  
  - In browser console:  
    - `localStorage.setItem('dev_tenant', 'acme')`   → behave like tenant.  
    - `localStorage.setItem('dev_tenant', 'platform')` → behave like platform admin.  
    - `localStorage.removeItem('dev_tenant')` → clear.  
  - Then refresh.  
  - Resolver reads this in `getDevTenantOverride()` only when hostname is localhost.

- **`src/components/dev/DevTenantBanner.jsx`**  
  - Renders only when **`import.meta.env.DEV`** is true.  
  - Shows at bottom: mode (Platform admin / Tenant app / Marketing), slug, `dev_tenant` value, hostname.  
  - Used in **`App.jsx`** so it appears on every page in dev.

---

## 8. File map (quick lookup)

| Concern              | File(s) |
|----------------------|--------|
| Entry, wrappers      | `index.html`, `src/main.jsx`, `src/App.jsx` |
| Domain detection     | `src/utils/tenantResolver.js` |
| Tenant context       | `src/context/TenantContext.jsx` |
| Route decision       | `src/routes/AppRoutes.jsx` |
| Auth state           | `src/features/auth/authSlice.js`, `src/features/auth/authSelectors.js` |
| Auth API             | `src/features/auth/authAPI.js` |
| HTTP client          | `src/services/axiosInstance.js` |
| Theme tokens         | `src/styles/variables.scss`, `src/styles/global.scss` |
| App shell            | `src/layouts/AppShellLayout.jsx` + `AppShellLayout.module.scss` |
| Sales nav            | `src/hooks/useSalesNavigation.js` |
| Auth layout          | `src/layouts/AuthLayout.jsx` |
| Dev banner           | `src/components/dev/DevTenantBanner.jsx` |

---

## 9. Safety rules (must remember)

1. **Never trust tenant from frontend** for authorization or data scope.  
2. **Never send `tenant_id` in API request body** — backend resolves tenant from the request host (subdomain).  
3. **Frontend tenant (slug, isPlatform, isTenant, isMarketing)** is only for:  
   - Choosing which route set to show.  
   - UI labels, nav, and conditional features.  
4. **baseURL** must stay **`window.location.origin`** so the same SPA works on www / admin / tenant subdomains and backend sees the correct host.

---

## 10. One-line flow summary

**Start:** `main.jsx` → Redux + TenantProvider + Router → `App.jsx` → `AppRoutes`.  
**AppRoutes** uses **useTenant()** (from resolver) → picks **MarketingRoutes** / **PlatformRoutes** / **TenantRoutes**.  
**TenantRoutes** use **ProtectedRoute** + **AppShellLayout** for `/` (HomePage).  
**Auth** lives in Redux; **axios** uses `window.location.origin` and attaches tokens; **refresh** and **logout** are handled in interceptors.  
**Rebrand** = edit theme tokens in `variables.scss`. **Dev** = optional `localStorage["dev_tenant"]` + **DevTenantBanner** to see mode.

---

*End of frontend flow reference.*
