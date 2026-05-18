import { query } from '../../config/db.js';
import * as callCreditsService from './callCreditsService.js';
import { serializePlanForClient } from '../superAdmin/telephonyBillingPlansService.js';
import { resolvePlanCycleIncludedCredit } from '../../utils/planCyclePricing.js';

/**
 * Idempotent grant of included call wallet credit for the plan's billing cycle.
 */
export async function grantIncludedWalletCredit(
  tenantId,
  plan,
  { grantSource, grantReference, createdByUserId = null, billingInterval = 'month' } = {}
) {
  const tid = Number(tenantId);
  const planId = Number(plan?.id);
  if (!tid || !planId) {
    const err = new Error('grantIncludedWalletCredit: tenant and plan required');
    err.status = 400;
    throw err;
  }

  const amountPaise = resolvePlanCycleIncludedCredit(plan, billingInterval);
  if (amountPaise < 1) {
    return { granted: false, reason: 'no_included_credit', amount_paise: 0 };
  }

  const source = String(grantSource || '').trim();
  const reference = String(grantReference || '').trim().slice(0, 191);
  if (!source || !reference) {
    const err = new Error('grantSource and grantReference are required');
    err.status = 400;
    throw err;
  }

  const allowed = new Set(['admin_assign', 'subscription_start', 'subscription_renewal']);
  if (!allowed.has(source)) {
    const err = new Error(`Invalid grant source: ${source}`);
    err.status = 400;
    throw err;
  }

  try {
    await query(
      `INSERT INTO tenant_telephony_wallet_grants
         (tenant_id, telephony_billing_plan_id, grant_source, grant_reference, amount_paise, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [tid, planId, source, reference, amountPaise, createdByUserId ?? null]
    );
  } catch (e) {
    if (e?.code === 'ER_DUP_ENTRY') {
      return { granted: false, reason: 'already_granted', amount_paise: amountPaise, grant_reference: reference };
    }
    throw e;
  }

  const planLabel = plan.name || plan.code || `plan #${planId}`;
  const wallet = await callCreditsService.addCredits(tid, {
    amountPaise,
    entryType: 'subscription_included',
    note: `Included credits: ${planLabel} (${reference})`.slice(0, 255),
    createdByUserId,
  });

  return {
    granted: true,
    amount_paise: amountPaise,
    grant_reference: reference,
    wallet,
    plan: serializePlanForClient(plan),
  };
}
