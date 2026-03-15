import { query } from '../config/db.js';

/**
 * Blocks access to email module when tenant has not purchased it (email_module_enabled = 0).
 * Allow GET /settings so the client can fetch flags and hide the UI.
 */
export async function requireEmailModuleEnabled(req, res, next) {
  if (req.method === 'GET' && req.path === '/settings') {
    return next();
  }
  const tenantId = req.tenant?.id;
  if (!tenantId) {
    return next();
  }
  try {
    const [row] = await query(
      'SELECT email_module_enabled FROM tenants WHERE id = ?',
      [tenantId]
    );
    if (row && row.email_module_enabled) {
      return next();
    }
    return res.status(403).json({
      error: 'Email module is not enabled for your account. Please contact your administrator.',
    });
  } catch (err) {
    return next(err);
  }
}
