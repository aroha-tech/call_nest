/**
 * Heuristics for whether an error is likely an OAuth / token problem (vs bad recipient, quota, etc.).
 */

export function isLikelyGoogleOAuthOrApiAuthFailure(errLike) {
  const status = errLike?.response?.status ?? errLike?.status ?? errLike?.code;
  if (status === 401 || status === 403) return true;
  const msg = String(errLike?.message || '').toLowerCase();
  return (
    msg.includes('invalid_grant') ||
    msg.includes('invalid credentials') ||
    msg.includes('unauthorized') ||
    msg.includes('login required')
  );
}

export function isLikelyMicrosoftGraphAuthHttpStatus(httpStatus) {
  return httpStatus === 401 || httpStatus === 403;
}
