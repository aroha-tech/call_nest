import * as billingService from '../../services/tenant/billingService.js';

function tenantIdFromReq(req) {
  const tenantId = Number(req.tenant?.id);
  if (!Number.isFinite(tenantId) || tenantId < 1) {
    const err = new Error('Tenant context required');
    err.status = 400;
    throw err;
  }
  return tenantId;
}

export async function getConfig(req, res, next) {
  try {
    tenantIdFromReq(req);
    return res.json({ data: billingService.getClientBillingConfig() });
  } catch (err) {
    return next(err);
  }
}

export async function listPlans(req, res, next) {
  try {
    const tenantId = tenantIdFromReq(req);
    const rows = await billingService.listPlansForTenant(tenantId);
    return res.json({ data: rows });
  } catch (err) {
    return next(err);
  }
}

export async function createOrder(req, res, next) {
  try {
    const tenantId = tenantIdFromReq(req);
    const planId = req.body?.planId ?? req.body?.plan_id;
    const result = await billingService.createCheckoutOrder(tenantId, req.user?.id, planId);
    return res.json({ data: result });
  } catch (err) {
    return next(err);
  }
}

export async function verifyPayment(req, res, next) {
  try {
    const tenantId = tenantIdFromReq(req);
    const result = await billingService.verifyPaymentAndActivate(tenantId, req.user?.id, req.body || {});
    return res.json({ data: result });
  } catch (err) {
    return next(err);
  }
}

export async function listPayments(req, res, next) {
  try {
    const tenantId = tenantIdFromReq(req);
    const result = await billingService.listPayments(tenantId, req.query || {});
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

export async function listSubscriptions(req, res, next) {
  try {
    const tenantId = tenantIdFromReq(req);
    const result = await billingService.listSubscriptions(tenantId, req.query || {});
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

export async function currentSubscription(req, res, next) {
  try {
    const tenantId = tenantIdFromReq(req);
    const row = await billingService.getCurrentSubscription(tenantId);
    return res.json({ data: row });
  } catch (err) {
    return next(err);
  }
}
