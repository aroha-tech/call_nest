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

