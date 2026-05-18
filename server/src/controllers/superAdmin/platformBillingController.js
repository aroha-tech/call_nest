import * as platformBillingService from '../../services/superAdmin/platformBillingService.js';
import {
  getRazorpaySettingsForAdmin,
  updateRazorpaySettings,
} from '../../services/billing/razorpayConfigService.js';

export async function listPlans(req, res, next) {
  try {
    const rows = await platformBillingService.listPlansPlatform();
    return res.json({ data: rows });
  } catch (err) {
    return next(err);
  }
}

export async function listPayments(req, res, next) {
  try {
    const { tenant_id: tenantId, page, limit, search } = req.query || {};
    const result = await platformBillingService.listAllPayments({
      tenantId,
      page,
      limit,
      search,
    });
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

export async function listSubscriptions(req, res, next) {
  try {
    const { tenant_id: tenantId, page, limit, search } = req.query || {};
    const result = await platformBillingService.listAllSubscriptions({
      tenantId,
      page,
      limit,
      search,
    });
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

export async function getRazorpaySettings(req, res, next) {
  try {
    const data = await getRazorpaySettingsForAdmin();
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
}

export async function patchRazorpaySettings(req, res, next) {
  try {
    const data = await updateRazorpaySettings(req.body || {}, req.user?.id);
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
}
