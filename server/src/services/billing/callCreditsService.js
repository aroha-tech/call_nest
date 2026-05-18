import { query, withConnection } from '../../config/db.js';
import {
  findById as findTelephonyBillingPlanById,
  serializePlanForClient,
} from '../superAdmin/telephonyBillingPlansService.js';
import {
  getDefaultByoPlatformFeePaisePerMinute,
  getDefaultCallMinBalancePaise,
  getDefaultCallRatePaisePerMinute,
  getDefaultUnlimitedMinutesCapPerMonth,
} from './platformSettingsService.js';
import { assertActiveTelephonySubscription } from './telephonySubscriptionGuard.js';

/**
 * Telephony call credits & billing.
 *
 * Wallet lives in tenant_call_credit_wallet (one row per tenant). Every change is
 * journaled into tenant_call_credit_ledger. Debits happen ON COMPLETION (we settle
 * from the provider webhook with the real connected duration). Credit mode debits;
 * unlimited mode only records usage in tenant_billing_usage_daily.
 *
 * Rate selection:
 *   default-account tenants -> tenants.call_rate_paise_per_minute_override
 *                              ?? platform_settings.default_call_rate_paise_per_minute
 *   byo-account tenants     -> tenants.byo_platform_fee_paise_per_minute_override
 *                              ?? platform_settings.default_byo_platform_fee_paise_per_minute
 *
 * Note: "connected minute" rounds up to the next whole minute.
 */

async function fetchTenantBillingRow(tenantId) {
  const [row] = await query(
    `SELECT id,
            telephony_account_mode,
            call_billing_mode,
            telephony_billing_plan_id,
            call_rate_paise_per_minute_override,
            byo_platform_fee_paise_per_minute_override,
            call_min_balance_paise_override,
            unlimited_minutes_cap_per_month_override
     FROM tenants
     WHERE id = ? AND is_deleted = 0
     LIMIT 1`,
    [tenantId]
  );
  if (!row) {
    const err = new Error('Tenant not found');
    err.status = 404;
    throw err;
  }
  return row;
}

export async function getTenantBillingConfig(tenantId) {
  const tenant = await fetchTenantBillingRow(tenantId);
  const [defaultRate, byoFee, defaultMinBal, defaultCap] = await Promise.all([
    getDefaultCallRatePaisePerMinute(),
    getDefaultByoPlatformFeePaisePerMinute(),
    getDefaultCallMinBalancePaise(),
    getDefaultUnlimitedMinutesCapPerMonth(),
  ]);

  let plan = null;
  if (tenant.telephony_billing_plan_id) {
    plan = await findTelephonyBillingPlanById(tenant.telephony_billing_plan_id);
  }

  const isBYO = String(tenant.telephony_account_mode) === 'byo_account';
  const callBillingMode = plan?.plan_type
    ? String(plan.plan_type)
    : String(tenant.call_billing_mode || 'credit');

  const planRate = plan?.call_rate_paise_per_minute;
  const planByoFee = plan?.byo_platform_fee_paise_per_minute;
  const planMinBal = plan?.call_min_balance_paise;
  const planCap = plan?.unlimited_minutes_cap_per_month;

  const ratePaisePerMinute = isBYO
    ? (tenant.byo_platform_fee_paise_per_minute_override ??
      planByoFee ??
      byoFee)
    : (tenant.call_rate_paise_per_minute_override ?? planRate ?? defaultRate);
  const minBalancePaise =
    tenant.call_min_balance_paise_override ?? planMinBal ?? defaultMinBal;
  const unlimitedMinutesCapPerMonth =
    tenant.unlimited_minutes_cap_per_month_override ?? planCap ?? defaultCap;

  return {
    accountMode: String(tenant.telephony_account_mode || 'default_account'),
    callBillingMode,
    ratePaisePerMinute: Math.max(0, Math.floor(Number(ratePaisePerMinute) || 0)),
    minBalancePaise: Math.max(0, Math.floor(Number(minBalancePaise) || 0)),
    unlimitedMinutesCapPerMonth: Math.max(0, Math.floor(Number(unlimitedMinutesCapPerMonth) || 0)),
    isBYO,
    billingPlan: serializePlanForClient(plan),
    billingSource: plan ? 'plan' : 'manual',
    defaults: {
      defaultRate,
      byoFee,
      defaultMinBal,
      defaultCap,
    },
    overrides: {
      call_rate_paise_per_minute_override: tenant.call_rate_paise_per_minute_override ?? null,
      byo_platform_fee_paise_per_minute_override:
        tenant.byo_platform_fee_paise_per_minute_override ?? null,
      call_min_balance_paise_override: tenant.call_min_balance_paise_override ?? null,
      unlimited_minutes_cap_per_month_override:
        tenant.unlimited_minutes_cap_per_month_override ?? null,
    },
  };
}

export async function getWallet(tenantId) {
  const [row] = await query(
    `SELECT tenant_id, balance_paise, lifetime_topup_paise, lifetime_spent_paise, last_topup_at, updated_at
     FROM tenant_call_credit_wallet WHERE tenant_id = ? LIMIT 1`,
    [tenantId]
  );
  if (!row) {
    return {
      tenant_id: tenantId,
      balance_paise: 0,
      lifetime_topup_paise: 0,
      lifetime_spent_paise: 0,
      last_topup_at: null,
      updated_at: null,
    };
  }
  return row;
}

async function ensureWalletRowInTx(conn, tenantId) {
  await conn.execute(
    `INSERT IGNORE INTO tenant_call_credit_wallet (tenant_id, balance_paise) VALUES (?, 0)`,
    [tenantId]
  );
}

/**
 * Pre-flight balance / cap check used by startCallForContact. Throws 402 (Payment Required)
 * if either:
 *   - credit-mode wallet falls below the configured minimum, or
 *   - unlimited-mode tenant has consumed >= the monthly cap (cap > 0).
 */
export async function assertCanStartCall(tenantId) {
  await assertActiveTelephonySubscription(tenantId);
  const cfg = await getTenantBillingConfig(tenantId);
  if (cfg.callBillingMode === 'credit') {
    const wallet = await getWallet(tenantId);
    if (Number(wallet.balance_paise) < cfg.minBalancePaise) {
      const err = new Error(
        `Insufficient call credits. Wallet balance is ${wallet.balance_paise} paise but minimum required is ${cfg.minBalancePaise} paise.`
      );
      err.status = 402;
      err.code = 'INSUFFICIENT_CREDITS';
      err.details = { balance_paise: wallet.balance_paise, min_balance_paise: cfg.minBalancePaise };
      throw err;
    }
    return cfg;
  }
  // Unlimited mode: enforce the monthly minute cap if one is configured.
  if (cfg.callBillingMode === 'unlimited' && cfg.unlimitedMinutesCapPerMonth > 0) {
    const monthRows = await query(
      `SELECT COALESCE(SUM(metric_value), 0) AS month_minutes
       FROM tenant_billing_usage_daily
       WHERE tenant_id = ?
         AND metric_key = 'minutes_connected'
         AND YEAR(usage_date) = YEAR(UTC_DATE())
         AND MONTH(usage_date) = MONTH(UTC_DATE())
         AND deleted_at IS NULL`,
      [tenantId]
    );
    const used = Number(monthRows[0]?.month_minutes || 0);
    if (used >= cfg.unlimitedMinutesCapPerMonth) {
      const err = new Error(
        `Monthly call cap reached: ${used}/${cfg.unlimitedMinutesCapPerMonth} minutes used this month.`
      );
      err.status = 402;
      err.code = 'UNLIMITED_CAP_REACHED';
      err.details = {
        used_minutes: used,
        cap_minutes: cfg.unlimitedMinutesCapPerMonth,
      };
      throw err;
    }
  }
  return cfg;
}

function ceilMinutes(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return 0;
  return Math.ceil(s / 60);
}

/**
 * Settle a single completed call. Idempotent: if the attempt is already settled (billed_at
 * is not null) we skip without throwing. Returns a small descriptor for callers.
 *
 * Behaviour:
 *   - Only `is_connected = 1` calls are billed. Failed / no_answer / busy are free.
 *   - Records minutes in tenant_billing_usage_daily for both billing modes.
 *   - Debits the wallet only when call_billing_mode = 'credit'.
 *   - Writes a ledger entry on every debit.
 */
export async function settleCallAttempt(attemptId) {
  const aid = Number(attemptId);
  if (!aid) {
    const err = new Error('settleCallAttempt: attemptId required');
    err.status = 400;
    throw err;
  }

  const [attempt] = await query(
    `SELECT id, tenant_id, duration_sec, is_connected, billed_at, tenant_telephony_account_id
     FROM contact_call_attempts WHERE id = ? LIMIT 1`,
    [aid]
  );
  if (!attempt) {
    return { settled: false, reason: 'attempt_not_found' };
  }
  if (attempt.billed_at) {
    return { settled: false, reason: 'already_settled', attempt_id: aid };
  }
  if (!attempt.is_connected) {
    await query(
      `UPDATE contact_call_attempts
       SET billed_at = UTC_TIMESTAMP(), billed_paise = 0, billed_unit_qty = 0
       WHERE id = ? AND billed_at IS NULL`,
      [aid]
    );
    return { settled: true, reason: 'not_connected_free', attempt_id: aid, billed_paise: 0 };
  }

  const cfg = await getTenantBillingConfig(attempt.tenant_id);
  const minutes = ceilMinutes(attempt.duration_sec);
  const rate = cfg.ratePaisePerMinute;
  const billedPaise = cfg.callBillingMode === 'credit' ? minutes * rate : 0;

  // Always record usage for both modes (audit + reporting).
  await query(
    `INSERT INTO tenant_billing_usage_daily (tenant_id, usage_date, metric_key, metric_value)
     VALUES (?, UTC_DATE(), 'calls_connected', 1)
     ON DUPLICATE KEY UPDATE metric_value = metric_value + 1, updated_at = CURRENT_TIMESTAMP`,
    [attempt.tenant_id]
  );
  if (minutes > 0) {
    await query(
      `INSERT INTO tenant_billing_usage_daily (tenant_id, usage_date, metric_key, metric_value)
       VALUES (?, UTC_DATE(), 'minutes_connected', ?)
       ON DUPLICATE KEY UPDATE metric_value = metric_value + VALUES(metric_value), updated_at = CURRENT_TIMESTAMP`,
      [attempt.tenant_id, minutes]
    );
  }

  if (cfg.callBillingMode !== 'credit' || billedPaise <= 0) {
    await query(
      `UPDATE contact_call_attempts
       SET billed_at = UTC_TIMESTAMP(),
           billed_paise = ?,
           billed_unit_qty = ?,
           billed_unit_rate_paise = ?,
           billing_mode_at_call = ?
       WHERE id = ? AND billed_at IS NULL`,
      [billedPaise, minutes, rate, cfg.callBillingMode, aid]
    );
    return {
      settled: true,
      attempt_id: aid,
      billing_mode: cfg.callBillingMode,
      billed_paise: billedPaise,
      billed_unit_qty: minutes,
      billed_unit_rate_paise: rate,
    };
  }

  // Credit mode: debit the wallet inside a transaction and write a ledger entry.
  return withConnection(async (conn) => {
    await conn.beginTransaction();
    try {
      await ensureWalletRowInTx(conn, attempt.tenant_id);
      // Re-check inside the txn so concurrent webhook deliveries can't double-debit.
      const [walletRows] = await conn.execute(
        `SELECT balance_paise, lifetime_spent_paise
         FROM tenant_call_credit_wallet WHERE tenant_id = ? FOR UPDATE`,
        [attempt.tenant_id]
      );
      const wallet = walletRows[0];
      const [attemptRows] = await conn.execute(
        `SELECT billed_at FROM contact_call_attempts WHERE id = ? FOR UPDATE`,
        [aid]
      );
      if (attemptRows[0]?.billed_at) {
        await conn.commit();
        return { settled: false, reason: 'already_settled', attempt_id: aid };
      }
      const newBalance = Number(wallet.balance_paise) - billedPaise;
      const newSpent = Number(wallet.lifetime_spent_paise) + billedPaise;
      await conn.execute(
        `UPDATE tenant_call_credit_wallet
         SET balance_paise = ?, lifetime_spent_paise = ?
         WHERE tenant_id = ?`,
        [newBalance, newSpent, attempt.tenant_id]
      );
      await conn.execute(
        `INSERT INTO tenant_call_credit_ledger
           (tenant_id, call_attempt_id, entry_type, amount_paise, balance_after_paise,
            unit_qty, unit_rate_paise, note)
         VALUES (?, ?, 'debit_call', ?, ?, ?, ?, ?)`,
        [
          attempt.tenant_id,
          aid,
          -billedPaise,
          newBalance,
          minutes,
          rate,
          `connected_min=${minutes}; rate_paise_per_min=${rate}`,
        ]
      );
      await conn.execute(
        `UPDATE contact_call_attempts
         SET billed_at = UTC_TIMESTAMP(),
             billed_paise = ?,
             billed_unit_qty = ?,
             billed_unit_rate_paise = ?,
             billing_mode_at_call = 'credit'
         WHERE id = ? AND billed_at IS NULL`,
        [billedPaise, minutes, rate, aid]
      );
      await conn.commit();
      return {
        settled: true,
        attempt_id: aid,
        billing_mode: 'credit',
        billed_paise: billedPaise,
        billed_unit_qty: minutes,
        billed_unit_rate_paise: rate,
        new_balance_paise: newBalance,
      };
    } catch (err) {
      try { await conn.rollback(); } catch (_) { /* ignore */ }
      throw err;
    }
  });
}

/**
 * Add credits on an existing connection (caller owns the transaction).
 * Used inside subscription activation / verify flows to avoid cross-connection lock waits.
 */
export async function addCreditsInTx(conn, tenantId, {
  amountPaise,
  entryType = 'topup',
  note = null,
  createdByUserId = null,
  callAttemptId = null,
} = {}) {
  const amt = Math.floor(Number(amountPaise) || 0);
  if (amt <= 0) {
    const err = new Error('amount_paise must be a positive integer');
    err.status = 400;
    throw err;
  }
  const allowed = new Set(['topup', 'adjustment_credit', 'refund', 'subscription_included']);
  if (!allowed.has(entryType)) {
    const err = new Error(`Invalid entry_type for credit: ${entryType}`);
    err.status = 400;
    throw err;
  }

  await ensureWalletRowInTx(conn, tenantId);
  const [walletRows] = await conn.execute(
    `SELECT balance_paise, lifetime_topup_paise FROM tenant_call_credit_wallet
     WHERE tenant_id = ? FOR UPDATE`,
    [tenantId]
  );
  const wallet = walletRows[0];
  const newBalance = Number(wallet.balance_paise) + amt;
  const newTopup =
    entryType === 'topup'
      ? Number(wallet.lifetime_topup_paise) + amt
      : Number(wallet.lifetime_topup_paise);
  await conn.execute(
    `UPDATE tenant_call_credit_wallet
     SET balance_paise = ?, lifetime_topup_paise = ?, last_topup_at = CASE WHEN ? = 'topup' THEN UTC_TIMESTAMP() ELSE last_topup_at END
     WHERE tenant_id = ?`,
    [newBalance, newTopup, entryType, tenantId]
  );
  await conn.execute(
    `INSERT INTO tenant_call_credit_ledger
       (tenant_id, call_attempt_id, entry_type, amount_paise, balance_after_paise, note, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      callAttemptId ?? null,
      entryType,
      amt,
      newBalance,
      note ? String(note).slice(0, 255) : null,
      createdByUserId ?? null,
    ]
  );
  return { tenant_id: tenantId, balance_paise: newBalance, last_added_paise: amt, entry_type: entryType };
}

/**
 * Add credits to a tenant's wallet. Used by:
 *   - super-admin manual adjustments (entry_type = 'adjustment_credit')
 *   - top-up flow (entry_type = 'topup')
 *
 * Returns the new wallet snapshot.
 */
export async function addCredits(tenantId, options = {}) {
  return withConnection(async (conn) => {
    await conn.beginTransaction();
    try {
      const result = await addCreditsInTx(conn, tenantId, options);
      await conn.commit();
      return result;
    } catch (err) {
      try {
        await conn.rollback();
      } catch (_) {
        /* ignore */
      }
      throw err;
    }
  });
}

export async function adjustDebit(tenantId, {
  amountPaise,
  note = null,
  createdByUserId = null,
} = {}) {
  const amt = Math.floor(Number(amountPaise) || 0);
  if (amt <= 0) {
    const err = new Error('amount_paise must be a positive integer');
    err.status = 400;
    throw err;
  }
  return withConnection(async (conn) => {
    await conn.beginTransaction();
    try {
      await ensureWalletRowInTx(conn, tenantId);
      const [walletRows] = await conn.execute(
        `SELECT balance_paise FROM tenant_call_credit_wallet
         WHERE tenant_id = ? FOR UPDATE`,
        [tenantId]
      );
      const wallet = walletRows[0];
      const newBalance = Number(wallet.balance_paise) - amt;
      await conn.execute(
        `UPDATE tenant_call_credit_wallet
         SET balance_paise = ?
         WHERE tenant_id = ?`,
        [newBalance, tenantId]
      );
      await conn.execute(
        `INSERT INTO tenant_call_credit_ledger
           (tenant_id, entry_type, amount_paise, balance_after_paise, note, created_by)
         VALUES (?, 'adjustment_debit', ?, ?, ?, ?)`,
        [tenantId, -amt, newBalance, note ? String(note).slice(0, 255) : null, createdByUserId ?? null]
      );
      await conn.commit();
      return { tenant_id: tenantId, balance_paise: newBalance, debited_paise: amt };
    } catch (err) {
      try { await conn.rollback(); } catch (_) { /* ignore */ }
      throw err;
    }
  });
}

export async function listLedger(
  tenantId,
  { page = 1, limit = 25, search = '', entryType = '' } = {}
) {
  const pageNum = Math.max(1, Math.floor(Number(page) || 1));
  const limitNum = Math.min(100, Math.max(1, Math.floor(Number(limit) || 25)));
  const offset = (pageNum - 1) * limitNum;
  const q = String(search || '').trim();
  const typeFilter = String(entryType || '').trim();

  const filters = ['tenant_id = ?'];
  const params = [tenantId];
  if (typeFilter) {
    filters.push('entry_type = ?');
    params.push(typeFilter);
  }
  if (q) {
    filters.push(
      '(entry_type LIKE ? OR note LIKE ? OR CAST(call_attempt_id AS CHAR) LIKE ? OR CAST(id AS CHAR) LIKE ?)'
    );
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  const where = filters.join(' AND ');

  const rows = await query(
    `SELECT id, tenant_id, call_attempt_id, entry_type, amount_paise, balance_after_paise,
            unit_qty, unit_rate_paise, note, created_by, created_at
     FROM tenant_call_credit_ledger
     WHERE ${where}
     ORDER BY id DESC
     LIMIT ${limitNum} OFFSET ${offset}`,
    params
  );
  const [countRow] = await query(
    `SELECT COUNT(*) AS total FROM tenant_call_credit_ledger WHERE ${where}`,
    params
  );
  return {
    page: pageNum,
    limit: limitNum,
    total: Number(countRow?.total || 0),
    rows,
  };
}

/**
 * Aggregated usage view used by the admin and tenant UIs:
 *   - calls connected today / this calendar month / last 30d
 *   - minutes connected today / this calendar month / last 30d
 *   - spend in paise this calendar month (credit mode only)
 *   - cap remaining + percent used (unlimited mode only)
 *
 * "Today" and "this month" follow UTC since tenant_billing_usage_daily.usage_date
 * is written as UTC_DATE() by settleCallAttempt.
 */
export async function getUsageSummary(tenantId) {
  const cfg = await getTenantBillingConfig(tenantId);

  const usageRows = await query(
    `SELECT
        SUM(CASE WHEN usage_date = UTC_DATE() AND metric_key = 'minutes_connected' THEN metric_value ELSE 0 END) AS today_minutes,
        SUM(CASE WHEN usage_date = UTC_DATE() AND metric_key = 'calls_connected'   THEN metric_value ELSE 0 END) AS today_calls,
        SUM(CASE WHEN YEAR(usage_date) = YEAR(UTC_DATE()) AND MONTH(usage_date) = MONTH(UTC_DATE())
                 AND metric_key = 'minutes_connected' THEN metric_value ELSE 0 END) AS month_minutes,
        SUM(CASE WHEN YEAR(usage_date) = YEAR(UTC_DATE()) AND MONTH(usage_date) = MONTH(UTC_DATE())
                 AND metric_key = 'calls_connected'   THEN metric_value ELSE 0 END) AS month_calls,
        SUM(CASE WHEN usage_date >= DATE_SUB(UTC_DATE(), INTERVAL 29 DAY)
                 AND metric_key = 'minutes_connected' THEN metric_value ELSE 0 END) AS last30_minutes,
        SUM(CASE WHEN usage_date >= DATE_SUB(UTC_DATE(), INTERVAL 29 DAY)
                 AND metric_key = 'calls_connected'   THEN metric_value ELSE 0 END) AS last30_calls
     FROM tenant_billing_usage_daily
     WHERE tenant_id = ? AND deleted_at IS NULL`,
    [tenantId]
  );
  const u = usageRows[0] || {};

  // Spend this calendar month (credit mode only, debits are negative in the ledger).
  const spendRows = await query(
    `SELECT COALESCE(SUM(-amount_paise), 0) AS month_spend_paise
     FROM tenant_call_credit_ledger
     WHERE tenant_id = ?
       AND entry_type IN ('debit_call', 'adjustment_debit')
       AND YEAR(created_at) = YEAR(UTC_TIMESTAMP())
       AND MONTH(created_at) = MONTH(UTC_TIMESTAMP())`,
    [tenantId]
  );
  const monthSpendPaise = Number(spendRows[0]?.month_spend_paise || 0);

  const todayMinutes = Number(u.today_minutes || 0);
  const todayCalls = Number(u.today_calls || 0);
  const monthMinutes = Number(u.month_minutes || 0);
  const monthCalls = Number(u.month_calls || 0);
  const last30Minutes = Number(u.last30_minutes || 0);
  const last30Calls = Number(u.last30_calls || 0);

  const cap = cfg.unlimitedMinutesCapPerMonth;
  const isUnlimited = cfg.callBillingMode === 'unlimited';
  const capped = isUnlimited && cap > 0;
  const capRemaining = capped ? Math.max(0, cap - monthMinutes) : null;
  const capUsedPct = capped ? Math.min(100, Math.round((monthMinutes / cap) * 100)) : null;
  const capExceeded = capped ? monthMinutes >= cap : false;

  return {
    billing_mode: cfg.callBillingMode,
    is_byo: cfg.isBYO,
    rate_paise_per_minute: cfg.ratePaisePerMinute,
    today: { minutes: todayMinutes, calls: todayCalls },
    this_month: {
      minutes: monthMinutes,
      calls: monthCalls,
      spend_paise: monthSpendPaise,
    },
    last_30d: { minutes: last30Minutes, calls: last30Calls },
    unlimited_cap: {
      enabled: capped,
      cap_minutes_per_month: cap,
      used_minutes: monthMinutes,
      remaining_minutes: capRemaining,
      used_pct: capUsedPct,
      exceeded: capExceeded,
    },
  };
}
