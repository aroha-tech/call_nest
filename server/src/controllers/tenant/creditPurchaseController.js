import * as creditPurchaseService from '../../services/tenant/creditPurchaseService.js';
import * as callCreditsService from '../../services/billing/callCreditsService.js';

function readTenantId(req) {
  const tenantId = req.tenant?.id;
  if (!tenantId) {
    const err = new Error('Tenant context required');
    err.status = 400;
    throw err;
  }
  return Number(tenantId);
}

export async function getConfig(req, res, next) {
  try {
    const tenantId = readTenantId(req);
    const data = await creditPurchaseService.getTenantPlansView(tenantId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function listPlans(req, res, next) {
  try {
    const tenantId = readTenantId(req);
    const result = await creditPurchaseService.listPurchasePlansForTenant(tenantId);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function createOrder(req, res, next) {
  try {
    const tenantId = readTenantId(req);
    const planId = req.body?.planId ?? req.body?.plan_id;
    const data = await creditPurchaseService.createPurchaseOrder(tenantId, req.user?.id, planId);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function verifyPayment(req, res, next) {
  try {
    const tenantId = readTenantId(req);
    const result = await creditPurchaseService.verifyPurchasePayment(tenantId, req.user?.id, req.body);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function getWalletSummary(req, res, next) {
  try {
    const tenantId = readTenantId(req);
    const [wallet, config] = await Promise.all([
      callCreditsService.getWallet(tenantId),
      callCreditsService.getTenantBillingConfig(tenantId),
    ]);
    res.json({ data: { wallet, config } });
  } catch (err) {
    next(err);
  }
}
