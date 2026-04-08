import * as contactDeletePolicyService from '../../services/tenant/contactDeletePolicyService.js';

export async function getPolicy(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const data = await contactDeletePolicyService.getAgentDeletePolicy(tenantId);
    if (!data) return res.status(404).json({ error: 'Workspace not found' });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function updatePolicy(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
    const { agents_can_delete_leads, agents_can_delete_contacts } = req.body || {};
    const data = await contactDeletePolicyService.updateAgentDeletePolicy(tenantId, {
      agents_can_delete_leads,
      agents_can_delete_contacts,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
