import * as meetingEmailTemplatesService from '../../services/tenant/meetingEmailTemplatesService.js';
import * as meetingEmailContentResolve from '../../services/tenant/meetingEmailContentResolve.js';

export async function preview(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const { template_kind, meeting, template_override } = req.body || {};
    if (!['created', 'updated', 'cancelled'].includes(template_kind)) {
      return res.status(400).json({ error: 'Invalid or missing template_kind' });
    }
    const data = await meetingEmailContentResolve.resolveMeetingEmailContent(
      tenantId,
      req.user?.id,
      template_kind,
      meeting || {},
      template_override || null
    );
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function list(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const data = await meetingEmailTemplatesService.list(tenantId, req.user?.id);
    res.json({
      data,
      placeholder_help: meetingEmailTemplatesService.MEETING_TEMPLATE_PLACEHOLDERS,
    });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const { templates } = req.body || {};
    const data = await meetingEmailTemplatesService.updateBatch(tenantId, req.user?.id, templates);
    res.json({
      data,
      placeholder_help: meetingEmailTemplatesService.MEETING_TEMPLATE_PLACEHOLDERS,
    });
  } catch (err) {
    next(err);
  }
}

export async function reset(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const { template_kind } = req.body || {};
    const row = await meetingEmailTemplatesService.resetOne(tenantId, req.user?.id, template_kind);
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
}
