/**
 * Simple password strength for UI feedback only.
 * Returns { level: 'weak'|'medium'|'strong', label: string }.
 */
export function getPasswordStrength(password) {
  if (!password || password.length === 0) {
    return { level: 'weak', label: '' };
  }
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  if (score <= 2) return { level: 'weak', label: 'Weak' };
  if (score <= 4) return { level: 'medium', label: 'Medium' };
  return { level: 'strong', label: 'Strong' };
}
