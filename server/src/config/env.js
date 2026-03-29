import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(path.join(__dirname, '../../'));

// Load .env first, then .env.production when APP_ENV or NODE_ENV is production (single knob)
dotenv.config({ path: path.join(serverRoot, '.env') });
const firstMode = (
  process.env.APP_ENV ||
  process.env.NODE_ENV ||
  'development'
).toLowerCase();
if (firstMode === 'production') {
  dotenv.config({ path: path.join(serverRoot, '.env.production') });
}

const appEnv = (
  process.env.APP_ENV ||
  process.env.NODE_ENV ||
  'development'
).toLowerCase();
const isProduction = appEnv === 'production';

// Keep Express / ecosystem expectations aligned when APP_ENV is the only flag set
if (process.env.APP_ENV) {
  process.env.NODE_ENV = isProduction ? 'production' : 'development';
}

function parseBootstrapHosts() {
  const raw = process.env.API_BOOTSTRAP_HOSTS || '';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// Parse DATABASE_URL if provided (format: mysql://user:password@host:port/database)
function parseDatabaseUrl() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return null;
  
  try {
    const url = new URL(dbUrl);
    return {
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1), // Remove leading /
    };
  } catch (err) {
    console.warn('Invalid DATABASE_URL format, using individual DB params');
    return null;
  }
}

const dbFromUrl = parseDatabaseUrl();

export const env = {
  port: Number(process.env.PORT) || 4000,
  /** Application mode: development | production (from APP_ENV or NODE_ENV) */
  appEnv,
  /** Alias for libraries that read NODE_ENV */
  nodeEnv: process.env.NODE_ENV || appEnv,
  isProduction,
  /**
   * Comma-separated allowed browser origins for CORS in production (e.g. https://admin.arohva.com,https://www.arohva.com).
   * If empty in production, falls back to FRONTEND_URL only. Development uses permissive CORS.
   */
  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  /** If set (e.g. .arohva.com), any https?://*.suffix origin is allowed in production in addition to corsOrigins */
  corsOriginSuffix: (process.env.CORS_ORIGIN_SUFFIX || '').trim().toLowerCase(),
  /** Hostnames (no port) allowed to use path-based API routing like dev — e.g. droplet IP before DNS */
  bootstrapHosts: parseBootstrapHosts(),
  jwtSecret: process.env.JWT_SECRET || 'change-in-production',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'change-refresh-secret-in-production',
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m', // Short-lived access token
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d', // Long-lived refresh token
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  db: dbFromUrl || {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'call_nest',
  },
  superAdmin: {
    email: process.env.SUPER_ADMIN_EMAIL || 'admin@callnest.com',
    password: process.env.SUPER_ADMIN_PASSWORD || 'ChangeMe123!',
  },
  /** Optional. Full URL for WhatsApp status webhook (e.g. ngrok). Used when account has no webhook_url set. */
  whatsappStatusCallbackUrl: process.env.WHATSAPP_STATUS_CALLBACK_URL || '',

  /** Email OAuth (Gmail / Outlook). Frontend redirect after connect. */
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',
  /** Base URL of this API (for OAuth callback). e.g. http://localhost:4000 */
  apiBaseUrl: process.env.API_BASE_URL || process.env.BASE_URL || 'http://localhost:4000',

  /** Gmail OAuth: create credentials at https://console.cloud.google.com/apis/credentials */
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  /** Optional. Defaults to apiBaseUrl + /api/tenant/email/oauth/google/callback */
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || null,

  /** Microsoft OAuth: create app at https://portal.azure.com -> App registrations */
  microsoftClientId: process.env.MICROSOFT_CLIENT_ID || '',
  microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
  /** Optional. Defaults to apiBaseUrl + /api/tenant/email/oauth/outlook/callback */
  microsoftRedirectUri: process.env.MICROSOFT_REDIRECT_URI || null,
  /** Azure AD tenant: common | organizations | consumers | or tenant GUID */
  microsoftTenant: process.env.MICROSOFT_TENANT || 'common',

  /** Max upload size for CSV contact/lead import (bytes). Default 5 MB. */
  csvImportMaxFileBytes: Math.max(
    1024 * 1024,
    Number(process.env.CSV_IMPORT_MAX_FILE_BYTES) || 5 * 1024 * 1024
  ),
};

/**
 * Path-based “dev style” API routing for bootstrap hosts (IP-only deploy before DNS points to the server).
 */
export function isBootstrapApiHost(hostHeader) {
  if (!hostHeader || !env.bootstrapHosts.length) return false;
  const [hostname] = hostHeader.split(':');
  if (!hostname) return false;
  return env.bootstrapHosts.includes(hostname.toLowerCase());
}
