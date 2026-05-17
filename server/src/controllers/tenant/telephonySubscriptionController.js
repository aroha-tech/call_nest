import * as telephonySubscriptionService from '../../services/billing/telephonySubscriptionService.js';

function readTenantId(req) {
  const tenantId = req.tenant?.id;
  if (!tenantId) {
    const err = new Error('Tenant context required');
    err.status = 400;
    throw err;
  }
  return Number(tenantId);
}

export async function getCurrent(req, res, next) {
  try {
    const tenantId = readTenantId(req);
    const data = await telephonySubscriptionService.getCurrentTelephonySubscription(tenantId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function createCheckout(req, res, next) {
  try {
    const tenantId = readTenantId(req);
    const planId = req.body?.planId ?? req.body?.plan_id;
    const autoRenew = Boolean(req.body?.autoRenew ?? req.body?.auto_renew);
    const billingInterval = req.body?.billingInterval ?? req.body?.billing_interval ?? 'month';
    const data = await telephonySubscriptionService.createSubscriptionCheckout(
      tenantId,
      req.user?.id,
      planId,
      { autoRenew, billingInterval }
    );
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function verifyCheckout(req, res, next) {
  try {
    const tenantId = readTenantId(req);
    const result = await telephonySubscriptionService.verifySubscriptionCheckout(
      tenantId,
      req.user?.id,
      req.body || {}
    );
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function listHistory(req, res, next) {
  try {
    const tenantId = readTenantId(req);
    const page = req.query.page;
    const limit = req.query.limit;
    const result = await telephonySubscriptionService.listSubscriptionHistory(tenantId, {
      page,
      limit,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}
