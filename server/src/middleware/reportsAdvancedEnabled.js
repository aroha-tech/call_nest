import { query } from '../config/db.js';

/**
 * Blocks task-manager / reports-hub "advanced" endpoints when the tenant flag is off.
 */
export async function requireTenantAdvancedReports(req, res, next) {
  try {
    const tenantId = req.tenant?.id ?? req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context is required' });
    }
    const [row] = await query(
      'SELECT reports_advanced_enabled FROM tenants WHERE id = ? AND is_deleted = 0 LIMIT 1',
      [tenantId]
    );
    if (!row || !Number(row.reports_advanced_enabled)) {
      return res.status(403).json({ error: 'Advanced reports are not enabled for this organization.' });
    }
    return next();
  } catch (err) {
    return next(err);
  }
}
