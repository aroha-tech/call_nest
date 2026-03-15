import crypto from 'crypto';
import { env } from '../../config/env.js';

const SECRET = env.jwtSecret || 'oauth-state-secret';
const TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Encode and sign state for OAuth callback (tenantId, userId).
 * @param {{ tenantId: number, userId: number }} payload
 * @returns {string} state string to pass to provider
 */
export function encodeState(payload) {
  const data = JSON.stringify({
    tenantId: Number(payload.tenantId),
    userId: Number(payload.userId),
    t: Date.now(),
  });
  const b64 = Buffer.from(data, 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

/**
 * Decode and verify state from OAuth callback.
 * @param {string} state
 * @returns {{ tenantId: number, userId: number } | null}
 */
export function decodeState(state) {
  if (!state || typeof state !== 'string') return null;
  const [b64, sig] = state.split('.');
  if (!b64 || !sig) return null;
  const expectedSig = crypto.createHmac('sha256', SECRET).update(b64).digest('base64url');
  if (sig !== expectedSig) return null;
  let data;
  try {
    data = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (Date.now() - (data.t || 0) > TTL_MS) return null;
  const tenantId = Number(data.tenantId);
  const userId = Number(data.userId);
  if (!tenantId || !userId) return null;
  return { tenantId, userId };
}
