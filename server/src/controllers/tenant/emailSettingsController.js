import { query } from '../../config/db.js';

/**
 * Get email module settings for this tenant.
 * - communicationPlanEnabled = email_communication_enabled (paid plan: tracking, automation, disposition triggers).
 * - emailModuleEnabled = email_module_enabled (0 = hide entire email module; client has not purchased).
 * - emailAutomationEnabled = email_automation_enabled (for future use).
 */
export async function getSettings(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context is required' });
    }
    let row;
    try {
      [row] = await query(
        'SELECT email_communication_enabled, email_module_enabled, email_automation_enabled FROM tenants WHERE id = ?',
        [tenantId]
      );
    } catch (e) {
      [row] = await query('SELECT email_communication_enabled FROM tenants WHERE id = ?', [tenantId]);
      row = row ? { ...row, email_module_enabled: 0, email_automation_enabled: 0 } : null;
    }
    const communicationPlanEnabled = !!row?.email_communication_enabled;
    const emailModuleEnabled = !!row?.email_module_enabled;
    const emailAutomationEnabled = !!row?.email_automation_enabled;
    res.json({
      data: {
        communicationPlanEnabled,
        emailModuleEnabled,
        emailAutomationEnabled,
      },
    });
  } catch (err) {
    next(err);
  }
}
