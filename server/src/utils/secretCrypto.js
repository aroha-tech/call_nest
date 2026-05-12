import crypto from 'crypto';
import { env } from '../config/env.js';

/**
 * AES-256-GCM symmetric encryption for at-rest secrets (provider API keys / tokens).
 *
 * Key source:
 *   - APP_ENCRYPTION_KEY env var (32 raw bytes, base64 OR hex encoded).
 *   - If missing in development, we derive a deterministic warning-only key from JWT_SECRET so
 *     local devs never see a hard crash; in production a missing key throws on first use.
 *
 * Storage layout (DB columns):
 *   ciphertext (mediumtext, base64)
 *   iv         (varchar(64), base64; 12 bytes)
 *   tag        (varchar(64), base64; 16 bytes)
 */

const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const KEY_LEN = 32;

let cachedKey = null;
let warnedFallback = false;

function deriveDevFallbackKey() {
  // Deterministic 32-byte key from JWT_SECRET; only used outside production so encrypted secrets
  // survive process restarts during local dev. NEVER use this in production.
  return crypto.createHash('sha256').update(String(env.jwtSecret || 'dev-secret')).digest();
}

function loadKey() {
  if (cachedKey) return cachedKey;
  const raw = String(process.env.APP_ENCRYPTION_KEY || '').trim();
  if (raw) {
    let buf = null;
    try {
      buf = Buffer.from(raw, 'base64');
      if (buf.length !== KEY_LEN) buf = null;
    } catch {
      buf = null;
    }
    if (!buf) {
      try {
        const hex = Buffer.from(raw, 'hex');
        if (hex.length === KEY_LEN) buf = hex;
      } catch {
        buf = null;
      }
    }
    if (!buf) {
      throw new Error('APP_ENCRYPTION_KEY must be 32 bytes encoded as base64 or hex.');
    }
    cachedKey = buf;
    return cachedKey;
  }
  if (env.isProduction) {
    throw new Error(
      'APP_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` and add it to .env.production.'
    );
  }
  if (!warnedFallback) {
    console.warn(
      '[secretCrypto] APP_ENCRYPTION_KEY missing — using a JWT-derived dev key. Set APP_ENCRYPTION_KEY before production.'
    );
    warnedFallback = true;
  }
  cachedKey = deriveDevFallbackKey();
  return cachedKey;
}

/**
 * Encrypt a JSON-serialisable value (object/string/etc).
 * Returns base64-encoded ciphertext / iv / auth-tag.
 */
export function encryptSecretJson(value) {
  const key = loadKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

/**
 * Decrypt the triple produced by encryptSecretJson(). Throws if tampered.
 */
export function decryptSecretJson({ ciphertext, iv, tag }) {
  if (!ciphertext || !iv || !tag) {
    throw new Error('decryptSecretJson: missing ciphertext / iv / tag');
  }
  const key = loadKey();
  const decipher = crypto.createDecipheriv(ALG, key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const enc = Buffer.from(ciphertext, 'base64');
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return JSON.parse(dec.toString('utf8'));
}

/** Convenience: redact a long secret for logs / UI hints (last 4 chars only). */
export function hintFromSecret(value) {
  const s = String(value || '');
  if (!s) return '';
  if (s.length <= 4) return '*'.repeat(s.length);
  return `${'*'.repeat(Math.min(8, s.length - 4))}${s.slice(-4)}`;
}
