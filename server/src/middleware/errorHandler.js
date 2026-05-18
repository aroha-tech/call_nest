/**
 * Global error handler middleware
 * Handles errors consistently across the application
 */

import { env } from '../config/env.js';

function coerceError(err) {
  if (err instanceof Error) return err;
  if (err && typeof err === 'object' && err.statusCode != null) {
    const razorpayMsg =
      typeof err.error === 'string'
        ? err.error
        : err.error?.description || err.error?.reason || null;
    const e = new Error(razorpayMsg || 'Payment provider request failed');
    e.status = err.statusCode;
    return e;
  }
  return err;
}

export function errorHandler(err, req, res, next) {
  const normalized = coerceError(err);
  if (!env.isProduction) {
    console.error('Error:', normalized);
  }

  const status = normalized.status || normalized.statusCode || 500;
  const message = normalized.message || 'Internal server error';

  res.status(status).json({
    error: message,
    ...(normalized.code && { code: normalized.code }),
    ...(!env.isProduction && { stack: normalized.stack }),
  });
}
