import mysql from 'mysql2/promise';
import { env } from './env.js';

// Optional SSL configuration (required for TiDB Serverless and other TLS-only hosts)
// Enable SSL automatically for TiDB Cloud hosts, or when DB_SSL=true is set.
const needsSsl =
  process.env.DB_SSL === 'true' ||
  (env.db.host && env.db.host.includes('tidbcloud.com'));

const sslOptions = needsSsl
  ? {
      // Use default system CAs; TiDB Cloud uses a public CA (Let's Encrypt)
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
    }
  : undefined;

const connectTimeoutMs = Number(process.env.DB_CONNECT_TIMEOUT_MS || 30000);
const poolSize = Math.min(50, Math.max(5, Number(process.env.DB_POOL_SIZE || 15)));
const maxIdle = Math.min(poolSize, Math.max(2, Number(process.env.DB_POOL_MAX_IDLE || 8)));
const idleTimeoutMs = Number(process.env.DB_POOL_IDLE_TIMEOUT_MS || 60000);

// Support both DATABASE_URL and individual connection params
const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  waitForConnections: true,
  connectionLimit: poolSize,
  maxIdle,
  /** Drop idle connections so the pool does not keep TCP sockets that NAT/firewalls may have closed */
  idleTimeout: idleTimeoutMs,
  queueLimit: 0,
  connectTimeout: connectTimeoutMs,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  ...(sslOptions && { ssl: sslOptions }),
});

/** Transient network / pool issues worth one or two retries */
function isTransientDbError(err) {
  if (!err || typeof err !== 'object') return false;
  const code = err.code;
  if (
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'EPIPE' ||
    code === 'EAI_AGAIN'
  ) {
    return true;
  }
  if (code === 'PROTOCOL_CONNECTION_LOST') return true;
  const errno = err.errno;
  if (errno === -60 || errno === -54 || errno === -61) return true;
  const state = err.sqlState || err.sqlstate;
  if (state === '08S01') return true;
  const msg = String(err.message || '').toLowerCase();
  if (
    msg.includes('timeout') &&
    (msg.includes('read') || msg.includes('connect') || msg.includes('pool'))
  ) {
    return true;
  }
  if (msg.includes('lost connection') || msg.includes('connection closed')) return true;
  return false;
}

const MAX_QUERY_ATTEMPTS = 3;
const BASE_RETRY_MS = 75;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute SQL. Returns: array of rows for SELECT; result object (insertId, affectedRows) for INSERT/UPDATE/DELETE.
 * Do not destructure as array for write operations, e.g. use `const result = await query(...)` not `const [result] = ...`.
 * Retries a few times on transient timeouts / dropped connections (common with remote MySQL or idle pools).
 */
export async function query(sql, params = []) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_QUERY_ATTEMPTS; attempt++) {
    try {
      const [rows] = await pool.execute(sql, params);
      return rows;
    } catch (err) {
      lastErr = err;
      const retry = isTransientDbError(err) && attempt < MAX_QUERY_ATTEMPTS;
      if (!retry) throw err;
      const delay = BASE_RETRY_MS * 2 ** (attempt - 1);
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          `[db] transient error (${err.code || err.errno}), retry ${attempt}/${MAX_QUERY_ATTEMPTS} in ${delay}ms`
        );
      }
      await sleep(delay);
    }
  }
  throw lastErr;
}

export { pool };
