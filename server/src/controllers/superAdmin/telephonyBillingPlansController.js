import * as telephonyBillingPlansService from '../../services/superAdmin/telephonyBillingPlansService.js';

export async function list(req, res, next) {
  try {
    const result = await telephonyBillingPlansService.findAll({
      search: req.query.search || '',
      planType: req.query.plan_type || '',
      planCategory: req.query.plan_category || '',
      includeInactive: req.query.include_inactive === 'true',
      page: req.query.page || 1,
      limit: req.query.limit || 20,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function options(req, res, next) {
  try {
    const rows = await telephonyBillingPlansService.findAllActiveOptions({
      planType: req.query.plan_type || '',
      planCategory: req.query.plan_category || 'tenant_billing',
    });
    res.json({
      data: rows.map(telephonyBillingPlansService.serializePlanForClient),
    });
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const row = await telephonyBillingPlansService.findById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Telephony billing plan not found' });
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
}

export async function reorder(req, res, next) {
  try {
    const { plan_category, plan_type, include_inactive, ordered_ids } = req.body || {};
    const result = await telephonyBillingPlansService.reorderPlans(
      {
        planCategory: plan_category,
        planType: plan_type || '',
        includeInactive: include_inactive === true || include_inactive === 'true',
        orderedIds: ordered_ids,
      },
      req.user?.id ?? null
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const row = await telephonyBillingPlansService.create(req.body || {}, req.user?.id ?? null);
    res.status(201).json({ data: row });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const row = await telephonyBillingPlansService.update(
      req.params.id,
      req.body || {},
      req.user?.id ?? null
    );
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
}

export async function toggleActive(req, res, next) {
  try {
    const row = await telephonyBillingPlansService.toggleActive(
      req.params.id,
      req.user?.id ?? null
    );
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await telephonyBillingPlansService.remove(req.params.id, req.user?.id ?? null);
    res.json({ message: 'Telephony billing plan deleted' });
  } catch (err) {
    next(err);
  }
}
