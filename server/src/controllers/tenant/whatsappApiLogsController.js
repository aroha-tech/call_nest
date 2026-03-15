import * as whatsappApiLogService from '../../services/tenant/whatsappApiLogService.js';

export async function getAll(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const whatsapp_account_id = req.query.whatsapp_account_id || null;
    const search = req.query.search && String(req.query.search).trim() !== '' ? String(req.query.search).trim() : null;
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;
    const [logs, total] = await Promise.all([
      whatsappApiLogService.findAll(tenantId, { whatsapp_account_id, search, limit, offset }),
      whatsappApiLogService.countAll(tenantId, { whatsapp_account_id, search }),
    ]);
    res.json({ data: logs, total });
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const log = await whatsappApiLogService.findById(tenantId, req.params.id);
    if (!log) {
      return res.status(404).json({ error: 'Log not found' });
    }
    res.json({ data: log });
  } catch (err) {
    next(err);
  }
}
