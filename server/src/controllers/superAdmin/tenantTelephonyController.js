import { query } from '../../config/db.js';
import { env } from '../../config/env.js';
import * as callCreditsService from '../../services/billing/callCreditsService.js';
import * as platformSettingsService from '../../services/billing/platformSettingsService.js';
import * as tenantTelephonyAccountsService from '../../services/tenant/telephony/tenantTelephonyAccountsService.js';

function buildWebhookUrl(account) {
  if (!account?.webhook_token) return null;
  const base = String(env.apiBaseUrl || '').replace(/\/$/, '');
  return `${base}/api/public/telephony/exotel/status/${encodeURIComponent(account.webhook_token)}`;
}

async function ensureTenantExists(tenantId) {
  const [row] = await query(
    `SELECT id FROM tenants WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    [tenantId]
  );
  if (!row) {
    const err = new Error('Tenant not found');
    err.status = 404;
    throw err;
  }
  return row;
}

function requireTenantId(req) {
  const tid = Number(req.params.tenant_id);
  if (!tid) {
    const err = new Error('tenant_id is required');
    err.status = 400;
    throw err;
  }
  return tid;
}

/** GET /platform-settings — show all telephony platform tunables. */
export async function getPlatformSettings(req, res, next) {
  try {
    const data = await platformSettingsService.getAllTelephonySettings();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

/** PATCH /platform-settings — update one or more telephony platform tunables. */
export async function updatePlatformSettings(req, res, next) {
  try {
    const body = req.body || {};
    const userId = req.user?.id ?? null;
    const writes = [];
    if (body.default_call_rate_paise_per_minute !== undefined) {
      writes.push(
        platformSettingsService.setSettingNumber(
          platformSettingsService.PLATFORM_SETTING_KEYS.DEFAULT_CALL_RATE_PAISE_PER_MINUTE,
          body.default_call_rate_paise_per_minute,
          userId
        )
      );
    }
    if (body.default_byo_platform_fee_paise_per_minute !== undefined) {
      writes.push(
        platformSettingsService.setSettingNumber(
          platformSettingsService.PLATFORM_SETTING_KEYS.DEFAULT_BYO_PLATFORM_FEE_PAISE_PER_MINUTE,
          body.default_byo_platform_fee_paise_per_minute,
          userId
        )
      );
    }
    if (body.default_call_min_balance_paise !== undefined) {
      writes.push(
        platformSettingsService.setSettingNumber(
          platformSettingsService.PLATFORM_SETTING_KEYS.DEFAULT_CALL_MIN_BALANCE_PAISE,
          body.default_call_min_balance_paise,
          userId
        )
      );
    }
    if (body.default_unlimited_minutes_cap_per_month !== undefined) {
      writes.push(
        platformSettingsService.setSettingNumber(
          platformSettingsService.PLATFORM_SETTING_KEYS.DEFAULT_UNLIMITED_MINUTES_CAP_PER_MONTH,
          body.default_unlimited_minutes_cap_per_month,
          userId
        )
      );
    }
    await Promise.all(writes);
    const data = await platformSettingsService.getAllTelephonySettings();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

/** GET /:tenant_id/billing — show the tenant's billing config + wallet + usage. */
export async function getTenantBilling(req, res, next) {
  try {
    const tenantId = requireTenantId(req);
    const [tenant] = await query(
      `SELECT id, name, slug, telephony_account_mode, call_billing_mode,
              call_rate_paise_per_minute_override,
              byo_platform_fee_paise_per_minute_override,
              call_min_balance_paise_override,
              unlimited_minutes_cap_per_month_override
       FROM tenants WHERE id = ? AND is_deleted = 0 LIMIT 1`,
      [tenantId]
    );
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    const [wallet, cfg, usage] = await Promise.all([
      callCreditsService.getWallet(tenantId),
      callCreditsService.getTenantBillingConfig(tenantId),
      callCreditsService.getUsageSummary(tenantId),
    ]);
    res.json({ data: { tenant, wallet, config: cfg, usage } });
  } catch (err) {
    next(err);
  }
}

/** PATCH /:tenant_id/billing — update overrides, modes. */
export async function updateTenantBilling(req, res, next) {
  try {
    const tenantId = requireTenantId(req);
    const body = req.body || {};
    const sets = [];
    const params = [];
    if (body.telephony_account_mode !== undefined) {
      const v = String(body.telephony_account_mode);
      if (!['default_account', 'byo_account'].includes(v)) {
        return res.status(400).json({ error: 'telephony_account_mode must be default_account or byo_account' });
      }
      sets.push('telephony_account_mode = ?');
      params.push(v);
    }
    if (body.call_billing_mode !== undefined) {
      const v = String(body.call_billing_mode);
      if (!['credit', 'unlimited'].includes(v)) {
        return res.status(400).json({ error: 'call_billing_mode must be credit or unlimited' });
      }
      sets.push('call_billing_mode = ?');
      params.push(v);
    }
    for (const key of [
      'call_rate_paise_per_minute_override',
      'byo_platform_fee_paise_per_minute_override',
      'call_min_balance_paise_override',
      'unlimited_minutes_cap_per_month_override',
    ]) {
      if (body[key] !== undefined) {
        const v = body[key];
        if (v === null || v === '') {
          sets.push(`${key} = NULL`);
        } else {
          const n = Number(v);
          if (!Number.isFinite(n) || n < 0) {
            return res.status(400).json({ error: `${key} must be a non-negative number` });
          }
          sets.push(`${key} = ?`);
          params.push(Math.floor(n));
        }
      }
    }
    if (!sets.length) {
      return res.status(400).json({ error: 'No allowed fields in body' });
    }
    params.push(tenantId);
    await query(`UPDATE tenants SET ${sets.join(', ')} WHERE id = ?`, params);
    return getTenantBilling(req, res, next);
  } catch (err) {
    next(err);
  }
}

/** POST /:tenant_id/credits/topup — credit the tenant's wallet manually. */
export async function topupCredits(req, res, next) {
  try {
    const tenantId = requireTenantId(req);
    const body = req.body || {};
    const result = await callCreditsService.addCredits(tenantId, {
      amountPaise: body.amount_paise,
      entryType: body.entry_type || 'topup',
      note: body.note || null,
      createdByUserId: req.user?.id ?? null,
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

/** POST /:tenant_id/credits/debit-adjust — manual debit (e.g. corrections). */
export async function debitCredits(req, res, next) {
  try {
    const tenantId = requireTenantId(req);
    const body = req.body || {};
    const result = await callCreditsService.adjustDebit(tenantId, {
      amountPaise: body.amount_paise,
      note: body.note || null,
      createdByUserId: req.user?.id ?? null,
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function getLedger(req, res, next) {
  try {
    const tenantId = requireTenantId(req);
    const data = await callCreditsService.listLedger(tenantId, {
      page: req.query.page,
      limit: req.query.limit,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

/** GET /:tenant_id/usage — usage summary only (lightweight, polled by UI). */
export async function getUsage(req, res, next) {
  try {
    const tenantId = requireTenantId(req);
    await ensureTenantExists(tenantId);
    const usage = await callCreditsService.getUsageSummary(tenantId);
    res.json({ data: usage });
  } catch (err) {
    next(err);
  }
}

/* -------------------------------------------------------------------------- */
/* BYO provider accounts (Exotel) management on behalf of a tenant.           */
/* Reuses the same tenantTelephonyAccountsService used by tenant admins.      */
/* -------------------------------------------------------------------------- */
export async function listAccounts(req, res, next) {
  try {
    const tenantId = requireTenantId(req);
    await ensureTenantExists(tenantId);
    const includeInactive = String(req.query.include_inactive || '') !== '0';
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

export async function getAccount(req, res, next) {
  try {
    const tenantId = requireTenantId(req);
    await ensureTenantExists(tenantId);
    const row = await tenantTelephonyAccountsService.getTenantAccountById(
      tenantId,
      Number(req.params.account_id)
    );
    if (!row) return res.status(404).json({ error: 'Account not found' });
    res.json({ data: { ...row, webhook_url: buildWebhookUrl(row) } });
  } catch (err) {
    next(err);
  }
}

export async function createAccount(req, res, next) {
  try {
    const tenantId = requireTenantId(req);
    await ensureTenantExists(tenantId);
    const userId = req.user?.id ?? null;
    const row = await tenantTelephonyAccountsService.createTenantAccount(
      tenantId,
      userId,
      req.body || {}
    );
    // UX nicety: when super-admin adds the first BYO account, auto-flip the
    // tenant into byo_account mode unless explicitly told not to.
    if (req.body?.auto_switch_to_byo !== false) {
      await query(
        `UPDATE tenants SET telephony_account_mode = 'byo_account' WHERE id = ?`,
        [tenantId]
      );
    }
    res.status(201).json({ data: { ...row, webhook_url: buildWebhookUrl(row) } });
  } catch (err) {
    next(err);
  }
}

export async function updateAccount(req, res, next) {
  try {
    const tenantId = requireTenantId(req);
    await ensureTenantExists(tenantId);
    const row = await tenantTelephonyAccountsService.updateTenantAccount(
      tenantId,
      req.user?.id ?? null,
      Number(req.params.account_id),
      req.body || {}
    );
    res.json({ data: { ...row, webhook_url: buildWebhookUrl(row) } });
  } catch (err) {
    next(err);
  }
}

export async function rotateAccountToken(req, res, next) {
  try {
    const tenantId = requireTenantId(req);
    await ensureTenantExists(tenantId);
    const row = await tenantTelephonyAccountsService.rotateWebhookToken(
      tenantId,
      req.user?.id ?? null,
      Number(req.params.account_id)
    );
    res.json({ data: { ...row, webhook_url: buildWebhookUrl(row) } });
  } catch (err) {
    next(err);
  }
}

export async function deleteAccount(req, res, next) {
  try {
    const tenantId = requireTenantId(req);
    await ensureTenantExists(tenantId);
    const r = await tenantTelephonyAccountsService.softDeleteTenantAccount(
      tenantId,
      req.user?.id ?? null,
      Number(req.params.account_id)
    );
    res.json({ data: r });
  } catch (err) {
    next(err);
  }
}
