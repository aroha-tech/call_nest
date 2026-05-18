import { query } from '../../config/db.js';
import { getCurrentTelephonySubscription } from './telephonySubscriptionService.js';
import { findById as findTelephonyPlanById } from '../superAdmin/telephonyBillingPlansService.js';

const ROLES = ['admin', 'manager', 'agent'];
const LIMIT_KEYS = {
  admin: 'admins',
  manager: 'managers',
  agent: 'agents',
};
const BUNDLE_COL = {
  admin: 'seat_limit_admins',
  manager: 'seat_limit_managers',
  agent: 'seat_limit_agents',
};
const OVERRIDE_COL = {
  admin: 'seat_limit_admins_override',
  manager: 'seat_limit_managers_override',
  agent: 'seat_limit_agents_override',
};
const PURCHASED_COL = {
  admin: 'purchased_admins',
  manager: 'purchased_managers',
  agent: 'purchased_agents',
};

function parseNonNegInt(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

async function loadTenantRow(tenantId) {
  const [row] = await query(
    `SELECT id, telephony_billing_plan_id,
            seat_limit_admins_override, seat_limit_managers_override,
            seat_limit_agents_override, seat_limit_channels_override
     FROM tenants WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    [tenantId]
  );
  return row || null;
}

async function ensureEntitlementRow(conn, tenantId) {
  const run = conn ? conn.execute.bind(conn) : query;
  await run(
    `INSERT IGNORE INTO tenant_seat_entitlements (tenant_id) VALUES (?)`,
    [tenantId]
  );
}

export async function getPurchasedEntitlements(tenantId) {
  const tid = Number(tenantId);
  await ensureEntitlementRow(null, tid);
  const [row] = await query(
    `SELECT purchased_admins, purchased_managers, purchased_agents, purchased_channels
     FROM tenant_seat_entitlements WHERE tenant_id = ?`,
    [tid]
  );
  return {
    admins: Number(row?.purchased_admins ?? 0),
    managers: Number(row?.purchased_managers ?? 0),
    agents: Number(row?.purchased_agents ?? 0),
    channels: Number(row?.purchased_channels ?? 0),
  };
}

async function resolveBundleFromPlan(tenantRow) {
  let plan = null;
  const planId = tenantRow?.telephony_billing_plan_id
    ? Number(tenantRow.telephony_billing_plan_id)
    : null;
  if (planId) {
    plan = await findTelephonyPlanById(planId);
  }
  if (!plan || plan.deleted_at) {
    const sub = await getCurrentTelephonySubscription(tenantRow.id);
    if (sub?.plan_id) {
      plan = await findTelephonyPlanById(sub.plan_id);
    }
  }
  if (!plan || plan.deleted_at) {
    return { admins: null, managers: null, agents: null, channels: null, plan: null };
  }
  return {
    admins: plan.seat_limit_admins == null ? null : Number(plan.seat_limit_admins),
    managers: plan.seat_limit_managers == null ? null : Number(plan.seat_limit_managers),
    agents:
      plan.seat_limit_agents == null
        ? plan.seat_limit_users == null
          ? null
          : Number(plan.seat_limit_users)
        : Number(plan.seat_limit_agents),
    channels: plan.seat_limit_channels == null ? null : Number(plan.seat_limit_channels),
    plan,
  };
}

function combineLimit(override, bundle, purchased) {
  if (override != null) return override;
  if (bundle == null && purchased === 0) return null;
  return (bundle ?? 0) + purchased;
}

export async function getSeatUsage(tenantId) {
  const tid = Number(tenantId);
  const [adminRow] = await query(
    `SELECT COUNT(*) AS c FROM users
     WHERE tenant_id = ? AND is_deleted = 0 AND is_platform_admin = 0 AND is_enabled = 1 AND role = 'admin'`,
    [tid]
  );
  const [managerRow] = await query(
    `SELECT COUNT(*) AS c FROM users
     WHERE tenant_id = ? AND is_deleted = 0 AND is_platform_admin = 0 AND is_enabled = 1 AND role = 'manager'`,
    [tid]
  );
  const [agentRow] = await query(
    `SELECT COUNT(*) AS c FROM users
     WHERE tenant_id = ? AND is_deleted = 0 AND is_platform_admin = 0 AND is_enabled = 1 AND role = 'agent'`,
    [tid]
  );
  const [channelRow] = await query(
    `SELECT COUNT(*) AS c FROM users
     WHERE tenant_id = ? AND is_deleted = 0 AND is_platform_admin = 0 AND is_enabled = 1
       AND role = 'agent' AND telephony_agent_leg_e164 IS NOT NULL AND telephony_agent_leg_e164 <> ''`,
    [tid]
  );
  return {
    admins: Number(adminRow?.c ?? 0),
    managers: Number(managerRow?.c ?? 0),
    agents: Number(agentRow?.c ?? 0),
    channels: Number(channelRow?.c ?? 0),
  };
}

/** Full seat limit picture for admin UI and enforcement. */
export async function getSeatLimitsSummary(tenantId) {
  const tid = Number(tenantId);
  const tenantRow = await loadTenantRow(tid);
  if (!tenantRow) {
    const err = new Error('Tenant not found');
    err.status = 404;
    throw err;
  }

  const [bundle, purchased, usage] = await Promise.all([
    resolveBundleFromPlan(tenantRow),
    getPurchasedEntitlements(tid),
    getSeatUsage(tid),
  ]);

  const overrides = {
    admins: parseNonNegInt(tenantRow.seat_limit_admins_override),
    managers: parseNonNegInt(tenantRow.seat_limit_managers_override),
    agents: parseNonNegInt(tenantRow.seat_limit_agents_override),
    channels: parseNonNegInt(tenantRow.seat_limit_channels_override),
  };

  const effective = {
    admins: combineLimit(overrides.admins, bundle.admins, purchased.admins),
    managers: combineLimit(overrides.managers, bundle.managers, purchased.managers),
    agents: combineLimit(overrides.agents, bundle.agents, purchased.agents),
    channels: combineLimit(overrides.channels, bundle.channels, purchased.channels),
  };

  return {
    bundle: {
      admins: bundle.admins,
      managers: bundle.managers,
      agents: bundle.agents,
      channels: bundle.channels,
      plan_name: bundle.plan?.name ?? null,
      plan_code: bundle.plan?.code ?? null,
    },
    purchased,
    overrides,
    effective,
    usage,
  };
}

export async function assertCanAddUser(tenantId, role) {
  const r = String(role || '').toLowerCase();
  if (!ROLES.includes(r)) return;

  const { effective, usage } = await getSeatLimitsSummary(tenantId);
  const key = LIMIT_KEYS[r];
  const limit = effective[key];
  if (limit == null) return;

  const inUse = usage[key];
  if (inUse >= limit) {
    const label = r === 'agent' ? 'agent' : r;
    const err = new Error(
      `Seat limit reached for ${label}s (${inUse}/${limit}). Purchase more seats or ask your platform administrator to increase the limit.`
    );
    err.status = 403;
    err.code = 'SEAT_LIMIT_REACHED';
    throw err;
  }
}

export async function assertCanAddChannel(tenantId) {
  const { effective, usage } = await getSeatLimitsSummary(tenantId);
  const limit = effective.channels;
  if (limit == null) return;
  if (usage.channels >= limit) {
    const err = new Error(
      `Unlimited-calling channel limit reached (${usage.channels}/${limit}). Purchase a channel add-on or contact your administrator.`
    );
    err.status = 403;
    err.code = 'CHANNEL_LIMIT_REACHED';
    throw err;
  }
}

export async function setPurchasedEntitlements(tenantId, counts, userId = null) {
  const tid = Number(tenantId);
  await ensureEntitlementRow(null, tid);
  const admins = parseNonNegInt(counts?.admins ?? counts?.purchased_admins);
  const managers = parseNonNegInt(counts?.managers ?? counts?.purchased_managers);
  const agents = parseNonNegInt(counts?.agents ?? counts?.purchased_agents);
  const channels = parseNonNegInt(counts?.channels ?? counts?.purchased_channels);

  await query(
    `UPDATE tenant_seat_entitlements
     SET purchased_admins = COALESCE(?, purchased_admins),
         purchased_managers = COALESCE(?, purchased_managers),
         purchased_agents = COALESCE(?, purchased_agents),
         purchased_channels = COALESCE(?, purchased_channels),
         updated_by = ?,
         updated_at = UTC_TIMESTAMP()
     WHERE tenant_id = ?`,
    [admins, managers, agents, channels, userId ?? null, tid]
  );
  return getPurchasedEntitlements(tid);
}

export async function addPurchasedSeats(
  tenantId,
  { admins = 0, managers = 0, agents = 0, channels = 0 },
  userId = null
) {
  const tid = Number(tenantId);
  await ensureEntitlementRow(null, tid);
  await query(
    `UPDATE tenant_seat_entitlements
     SET purchased_admins = purchased_admins + ?,
         purchased_managers = purchased_managers + ?,
         purchased_agents = purchased_agents + ?,
         purchased_channels = purchased_channels + ?,
         updated_by = ?,
         updated_at = UTC_TIMESTAMP()
     WHERE tenant_id = ?`,
    [
      Math.max(0, Math.floor(Number(admins) || 0)),
      Math.max(0, Math.floor(Number(managers) || 0)),
      Math.max(0, Math.floor(Number(agents) || 0)),
      Math.max(0, Math.floor(Number(channels) || 0)),
      userId ?? null,
      tid,
    ]
  );
}

export async function applySeatPurchaseFromPlan(tenantId, plan, quantity, userId = null) {
  const qty = Math.max(1, Math.floor(Number(quantity) || 1));
  const role = String(plan.seat_role || 'agent');
  const withChannel = plan.includes_unlimited_channels === 1;

  if (role === 'admin') {
    await addPurchasedSeats(tenantId, { admins: qty }, userId);
  } else if (role === 'manager') {
    await addPurchasedSeats(tenantId, { managers: qty }, userId);
  } else {
    await addPurchasedSeats(tenantId, { agents: qty }, userId);
    if (withChannel) {
      await addPurchasedSeats(tenantId, { channels: qty }, userId);
    }
  }
}
