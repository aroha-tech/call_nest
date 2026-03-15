# Call Nest — Frontend

SaaS-grade React client with subdomain-ready auth (multi-tenant CRM).

## Stack

- React 18, JavaScript
- Redux Toolkit, React Router v6, Axios
- SCSS (modular)

## Run

```bash
npm install
npm run dev
```

Dev server: `http://localhost:3000`. API is proxied to the backend (see `vite.config.js`).

## Build

```bash
npm run build
npm run preview
```

## Auth

- **Login** — `/login` (email + password, token in memory)
- **Register tenant** — `/register` (company + slug + admin)
- **Refresh** — 401 triggers refresh then retry; tokens in memory only
- **Logout** — clears state and revokes refresh token via API
