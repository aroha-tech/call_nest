import * as seatPurchaseService from '../../services/tenant/seatPurchaseService.js';
import * as seatEntitlementService from '../../services/billing/seatEntitlementService.js';

function readTenantId(req) {
  const tenantId = req.tenant?.id;
  if (!tenantId) {
    const err = new Error('Tenant context required');
    err.status = 400;
    throw err;
  }
  return Number(tenantId);
}

export async function listPlans(req, res, next) {
  try {
    const tenantId = readTenantId(req);
    const result = await seatPurchaseService.listSeatPlansForTenant(tenantId);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function getLimits(req, res, next) {
  try {
    const tenantId = readTenantId(req);
    const seatLimits = await seatEntitlementService.getSeatLimitsSummary(tenantId);
    res.json({ data: { seatLimits } });
  } catch (err) {
    next(err);
  }
}

export async function createOrder(req, res, next) {
  try {
    const tenantId = readTenantId(req);
    const planId = req.body?.planId ?? req.body?.plan_id;
    const quantity = req.body?.quantity ?? 1;
    const data = await seatPurchaseService.createSeatPurchaseOrder(
      tenantId,
      req.user?.id,
      planId,
      quantity
    );
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function verifyPayment(req, res, next) {
  try {
    const tenantId = readTenantId(req);
    const result = await seatPurchaseService.verifySeatPurchasePayment(tenantId, req.user?.id, req.body);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}
