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

export async function getBalance(req, res, next) {
  try {
    const tenantId = readTenantId(req);
    const [wallet, config, usage] = await Promise.all([
      callCreditsService.getWallet(tenantId),
      callCreditsService.getTenantBillingConfig(tenantId),
      callCreditsService.getUsageSummary(tenantId),
    ]);
    res.json({ data: { wallet, config, usage } });
  } catch (err) {
    next(err);
  }
}

export async function getUsage(req, res, next) {
  try {
    const tenantId = readTenantId(req);
    const usage = await callCreditsService.getUsageSummary(tenantId);
    res.json({ data: usage });
  } catch (err) {
    next(err);
  }
}

export async function getLedger(req, res, next) {
  try {
    const tenantId = readTenantId(req);
    const data = await callCreditsService.listLedger(tenantId, {
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
      entryType: req.query.entry_type ?? req.query.entryType,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
