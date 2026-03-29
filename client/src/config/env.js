/**
 * Frontend environment (Vite).
 * - Development: `npm run dev` → mode development, optional .env.development
 * - Production: `npm run build` → mode production, loads .env.production
 *
 * Override with VITE_APP_ENV in env files if you need an explicit label.
 */
export const appEnv = import.meta.env.VITE_APP_ENV || import.meta.env.MODE;
export const isProduction = import.meta.env.PROD;
