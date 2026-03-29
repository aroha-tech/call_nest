/**
 * Global error handler middleware
 * Handles errors consistently across the application
 */

import { env } from '../config/env.js';

export function errorHandler(err, req, res, next) {
  if (!env.isProduction) {
    console.error('Error:', err);
  }

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(status).json({
    error: message,
    ...(!env.isProduction && { stack: err.stack }),
  });
}
