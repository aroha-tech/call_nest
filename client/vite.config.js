import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Development only: `server` runs when you use `npm run dev`.
 * It is ignored for `npm run build` — production has no Vite dev server.
 *
 * Prod API URL is not configured here. At build time Vite injects
 * `VITE_*` from `.env.production`; `src/services/axiosInstance.js` uses
 * `VITE_API_BASE_URL` (or same-origin if empty). See `.env.*.example`.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
