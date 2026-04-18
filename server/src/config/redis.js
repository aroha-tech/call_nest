import { createClient } from 'redis';
import { env } from './env.js';

// Only true after a successful connect; server runs without Redis when false
let redisAvailable = false;

// Redis client for caching refresh tokens / sessions
export const redis = createClient({
  url: env.redisUrl || 'redis://localhost:6379',
});

export function isRedisAvailable() {
  return redisAvailable;
}

export async function initRedis() {
  if (redis.isOpen) {
    redisAvailable = true;
    return;
  }
  try {
    await redis.connect();
    redisAvailable = true;
    redis.on('error', (err) => {
      console.error('Redis error:', err);
    });
    console.log('Redis connected');
  } catch (err) {
    redisAvailable = false;
    throw err;
  }
}

// Key for a specific refresh token hash (tenant_id is stored in value)
export function refreshTokenKey(tokenHash) {
  return `rt:${tokenHash}`;
}

export function userSessionsKey(tenantId, userId) {
  return `user_sessions:${tenantId}:${userId}`;
}

/** Cluster-wide count of running background jobs (incremented when a worker starts a job, decremented when it finishes). */
const BACKGROUND_JOB_SLOT_KEY = 'callnest:bg:running_slots';

const BG_SLOT_ACQUIRE_LUA = `
local c = tonumber(redis.call('GET', KEYS[1]) or '0')
local max = tonumber(ARGV[1])
if c >= max then return 0 end
redis.call('INCR', KEYS[1])
return 1
`;

const BG_SLOT_RELEASE_LUA = `
local c = tonumber(redis.call('GET', KEYS[1]) or '0')
if c <= 0 then return 0 end
redis.call('DECR', KEYS[1])
return 1
`;

/**
 * Try to take one global “slot” for running a background job (Redis).
 * @param {number} maxConcurrent global max (e.g. 16)
 * @returns {Promise<boolean>} true if this process may start another job
 */
export async function acquireBackgroundJobSlot(maxConcurrent) {
  if (!redisAvailable || !maxConcurrent || maxConcurrent < 1) return true;
  try {
    const n = await redis.eval(BG_SLOT_ACQUIRE_LUA, {
      keys: [BACKGROUND_JOB_SLOT_KEY],
      arguments: [String(maxConcurrent)],
    });
    return Number(n) === 1;
  } catch (e) {
    console.error('[redis] background job slot acquire failed:', e?.message || e);
    return true;
  }
}

/** Release one slot after a job finishes (pair with acquire). */
export async function releaseBackgroundJobSlot() {
  if (!redisAvailable) return;
  try {
    await redis.eval(BG_SLOT_RELEASE_LUA, {
      keys: [BACKGROUND_JOB_SLOT_KEY],
      arguments: [],
    });
  } catch (e) {
    console.error('[redis] background job slot release failed:', e?.message || e);
  }
}

