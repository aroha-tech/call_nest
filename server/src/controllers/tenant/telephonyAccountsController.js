import * as tenantTelephonyAccountsService from '../../services/tenant/telephony/tenantTelephonyAccountsService.js';
import * as callCreditsService from '../../services/billing/callCreditsService.js';
import { query } from '../../config/db.js';
import { env } from '../../config/env.js';

function readTenantId(req) {
  const tenantId = req.tenant?.id;
  if (!tenantId) {
    const err = new Error('Tenant context required');
    err.status = 400;
    throw err;
  }
  return Number(tenantId);
}

function userHasPermission(req, code) {
  if (req.user?.isPlatformAdmin) return true;
  return (req.user?.permissions || []).includes(code);
}

function canManageTelephonyAccountMode(req) {
  return (
    userHasPermission(req, 'settings.manage') ||
    userHasPermission(req, 'telephony.accounts.manage')
  );
}

function buildWebhookUrl(account) {
  const base = String(env.apiBaseUrl || '').replace(/\/$/, '');
  return `${base}/api/public/telephony/exotel/status/${encodeURIComponent(account.webhook_token)}`;
}

export async function list(req, res, next) {
  try {
    const tenantId = readTenantId(req);
    const includeInactive = String(req.query.include_inactive || '') === '1';
    const rows = await tenantTelephonyAccountsService.listTenantAccounts(tenantId, {
      includeInactive,
    });
    res.json({
      data: rows.map((r) => ({ ...r, webhook_url: buildWebhookUrl(r) })),
    });
  } catch (err) {
    next(err);
  }
}

export async function get(req, res, next) {
  try {
    const tenantId = readTenantId(req);
    const row = await tenantTelephonyAccountsService.getTenantAccountById(
      tenantId,
      Number(req.params.id)
    );
    if (!row) return res.status(404).json({ error: 'Account not found' });
    res.json({ data: { ...row, webhook_url: buildWebhookUrl(row) } });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const tenantId = readTenantId(req);
    const row = await tenantTelephonyAccountsService.createTenantAccount(
      tenantId,
      req.user?.id ?? null,
      req.body || {}
    );
    // Auto-flip the tenant into BYO mode the first time an account is created (UX nicety).
    if (req.body?.auto_switch_to_byo !== false) {
      await query(
        `UPDATE tenants
         SET telephony_account_mode = 'byo_account'
         WHERE id = ?`,
        [tenantId]
      );
    }
    res.status(201).json({ data: { ...row, webhook_url: buildWebhookUrl(row) } });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const tenantId = readTenantId(req);
    const row = await tenantTelephonyAccountsService.updateTenantAccount(
      tenantId,
      req.user?.id ?? null,
      Number(req.params.id),
      req.body || {}
    );
    res.json({ data: { ...row, webhook_url: buildWebhookUrl(row) } });
  } catch (err) {
    next(err);
  }
}

export async function rotateToken(req, res, next) {
  try {
    const tenantId = readTenantId(req);
    const row = await tenantTelephonyAccountsService.rotateWebhookToken(
      tenantId,
      req.user?.id ?? null,
      Number(req.params.id)
    );
    res.json({ data: { ...row, webhook_url: buildWebhookUrl(row) } });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const tenantId = readTenantId(req);
    const r = await tenantTelephonyAccountsService.softDeleteTenantAccount(
      tenantId,
      req.user?.id ?? null,
      Number(req.params.id)
    );
    res.json({ data: r });
  } catch (err) {
    next(err);
  }
}

/** GET /mode — returns the tenant's telephony account mode + call billing mode + assigned plan. */
export async function getMode(req, res, next) {
  try {
    const tenantId = readTenantId(req);
    const [row] = await query(
      `SELECT telephony_account_mode, call_billing_mode, telephony_billing_plan_id
       FROM tenants WHERE id = ? AND is_deleted = 0 LIMIT 1`,
      [tenantId]
    );
    if (!row) return res.status(404).json({ error: 'Tenant not found' });
    const cfg = await callCreditsService.getTenantBillingConfig(tenantId);
    res.json({
      data: {
        telephony_account_mode: row.telephony_account_mode,
        call_billing_mode: cfg.callBillingMode,
        telephony_billing_plan_id: row.telephony_billing_plan_id ?? null,
        billing_plan: cfg.billingPlan,
        billing_source: cfg.billingSource,
      },
    });
  } catch (err) {
    next(err);
  }
}

/** PATCH /mode — tenant admins may change telephony_account_mode only; call_billing_mode is super-admin. */
export async function updateMode(req, res, next) {
  try {
    const tenantId = readTenantId(req);
    const body = req.body || {};
    if (body.call_billing_mode !== undefined) {
      return res.status(403).json({
        error:
          'Call billing mode can only be changed by a platform administrator from Telephony & Credits.',
      });
    }
    const sets = [];
    const params = [];
    if (body.telephony_account_mode !== undefined) {
      if (!canManageTelephonyAccountMode(req)) {
        return res.status(403).json({
          error: 'Permission denied: telephony.accounts.manage or settings.manage required to change telephony account mode.',
        });
      }
      const v = String(body.telephony_account_mode);
      if (!['default_account', 'byo_account'].includes(v)) {
        return res.status(400).json({ error: 'telephony_account_mode must be default_account or byo_account' });
      }
      if (v === 'byo_account') {
        const accounts = await tenantTelephonyAccountsService.listTenantAccounts(tenantId, {
          includeInactive: false,
        });
        if (!accounts.length) {
          return res.status(409).json({
            error: 'Cannot switch to byo_account: no active telephony account configured for this tenant.',
          });
        }
      }
      sets.push('telephony_account_mode = ?');
      params.push(v);
    }
    if (!sets.length) {
      return res.status(400).json({ error: 'No allowed fields in body' });
    }
    params.push(tenantId);
    await query(`UPDATE tenants SET ${sets.join(', ')} WHERE id = ?`, params);
    return getMode(req, res, next);
  } catch (err) {
    next(err);
  }
}
