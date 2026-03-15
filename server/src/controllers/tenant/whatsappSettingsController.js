import { query } from '../../config/db.js';

// Get current WhatsApp send settings for this tenant
export async function getSettings(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context is required' });
    }
    const [row] = await query(
      'SELECT whatsapp_send_mode, whatsapp_automation_enabled FROM tenants WHERE id = ?',
      [tenantId]
    );
    const automationEnabled = !!row?.whatsapp_automation_enabled;
    // If automation is not enabled, effective mode is always manual
    const mode =
      automationEnabled && row?.whatsapp_send_mode === 'automatic' ? 'automatic' : 'manual';
    res.json({ data: { mode, automationEnabled } });
  } catch (err) {
    next(err);
  }
}

// Update WhatsApp send mode (manual vs automatic) for this tenant
export async function updateSettings(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context is required' });
    }

    const { mode } = req.body || {};
    if (!mode || !['manual', 'automatic'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode. Use "manual" or "automatic".' });
    }

    // Only allow admin/manager to change settings
    const role = req.user?.role;
    if (role === 'agent') {
      return res.status(403).json({ error: 'Only admin or manager can update WhatsApp settings' });
    }

    const [tenantRow] = await query(
      'SELECT whatsapp_automation_enabled FROM tenants WHERE id = ?',
      [tenantId]
    );
    const automationEnabled = !!tenantRow?.whatsapp_automation_enabled;
    if (!automationEnabled && mode === 'automatic') {
      return res
        .status(400)
        .json({ error: 'Automatic send mode is only available for subscribed WhatsApp automation.' });
    }

    await query('UPDATE tenants SET whatsapp_send_mode = ? WHERE id = ?', [mode, tenantId]);
    res.json({ data: { mode, automationEnabled } });
  } catch (err) {
    next(err);
  }
}

