/**
 * Token helper utilities
 * Hash refresh tokens before storing (security best practice)
 */

import crypto from 'crypto';

/**
 * Hash refresh token for storage
 * Store hashed version, compare on refresh
 */
export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate random refresh token
 */
export function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}
