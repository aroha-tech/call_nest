/**
 * Date helper utilities
 */

/**
 * Parse JWT expiration string (e.g., "7d", "30d", "1h") and return Date
 */
export function parseExpiration(expiresIn) {
  const now = new Date();
  const match = expiresIn.match(/^(\d+)([dhms])$/);
  
  if (!match) {
    // Default to 7 days if invalid format
    now.setDate(now.getDate() + 7);
    return now;
  }
  
  const value = parseInt(match[1], 10);
  const unit = match[2];
  
  switch (unit) {
    case 'd':
      now.setDate(now.getDate() + value);
      break;
    case 'h':
      now.setHours(now.getHours() + value);
      break;
    case 'm':
      now.setMinutes(now.getMinutes() + value);
      break;
    case 's':
      now.setSeconds(now.getSeconds() + value);
      break;
  }
  
  return now;
}
