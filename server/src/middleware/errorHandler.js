/**
 * Global error handler middleware
 * Handles errors consistently across the application
 */

export function errorHandler(err, req, res, next) {
  // Log error in development
  if (process.env.NODE_ENV === 'development') {
    console.error('Error:', err);
  }
  
  // Determine status code
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';
  
  // Send error response
  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}
