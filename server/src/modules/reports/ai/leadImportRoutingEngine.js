/**
 * CallXTime — lead import “smart” routing (on-server)
 * Same product philosophy as X Insights: deterministic signals + explainable heuristics.
 * No third-party AI APIs — tune scoring here without touching SQL or import plumbing.
 */

import crypto from 'crypto';

export const LEAD_IMPORT_ROUTING_ENGINE_ID = 'nest-lead-routing';
export const LEAD_IMPORT_ROUTING_VERSION = '1.0.0';

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function emailLocalPart(email) {
  const s = String(email || '').trim().toLowerCase();
  const at = s.indexOf('@');
  if (at <= 0) return '';
  return s.slice(0, at);
}

/**
 * Tokens from the lead row (names, email local-part, source, phone digits).
 * @param {object} ctx
 * @param {string} [ctx.first_name]
 * @param {string} [ctx.last_name]
 * @param {string} [ctx.display_name]
 * @param {string} [ctx.email]
 * @param {string} [ctx.finalSource]
 * @param {string} [ctx.primaryPhone]
 */
function leadTokenSet(ctx) {
  const parts = [
    ctx?.first_name,
    ctx?.last_name,
    ctx?.display_name,
    ctx?.finalSource,
    ctx?.primaryPhone,
    emailLocalPart(ctx?.email),
  ];
  const set = new Set();
  for (const p of parts) {
    for (const t of tokenize(p)) set.add(t);
  }
  return set;
}

function agentTokenSet(meta) {
  const set = new Set();
  if (!meta) return set;
  for (const t of tokenize(meta.label)) set.add(t);
  for (const t of tokenize(meta.email)) set.add(t);
  for (const t of tokenize(emailLocalPart(meta.email))) set.add(t);
  return set;
}

function overlapCount(leadSet, agentSet) {
  let n = 0;
  for (const t of leadSet) {
    if (agentSet.has(t)) n += 1;
  }
  return n;
}

/** Deterministic weighted pick from lead fingerprint. */
function pickHashStableWeighted(pool, ctx) {
  const h = crypto.createHash('sha256');
  h.update(String(ctx?.email || ''));
  h.update('|');
  h.update(String(ctx?.primaryPhone || ''));
  h.update('|');
  h.update(String(ctx?.finalSource || ''));
  h.update('|');
  h.update(String(ctx?.first_name || ''));
  h.update('|');
  h.update(String(ctx?.last_name || ''));
  h.update('|nest-smart|');
  const buf = h.digest();
  const n = buf.readUInt32BE(0);
  const total = pool.reduce((s, p) => s + (Number(p.weight) > 0 ? Number(p.weight) : 1), 0);
  let x = total ? n % total : 0;
  for (const p of pool) {
    const w = Number(p.weight) > 0 ? Number(p.weight) : 1;
    if (x < w) return Number(p.user_id);
    x -= w;
  }
  return Number(pool[0].user_id);
}

/**
 * Pick an agent using pool weights × lexical overlap with the lead (deterministic tie via hash).
 * @param {object} ctx — lead fields (same shape as import row context)
 * @param {Array<{ user_id: number; weight: number }>} pool
 * @param {Map<number, { id: number; label: string; email?: string }>} agentMeta
 * @returns {number|null} user_id
 */
export function pickXAiSmartAgentFromLead(ctx, pool, agentMeta) {
  if (!pool?.length) return null;
  if (pool.length === 1) return Number(pool[0].user_id);

  const leadTok = leadTokenSet(ctx);
  /** Per overlapping token, bump effective weight (capped). */
  const PER_TOKEN_BOOST = 0.12;
  const MAX_BOOST = 0.85;

  const enriched = pool.map((p) => {
    const uid = Number(p.user_id);
    const m = agentMeta?.get(uid);
    const overlap = overlapCount(leadTok, agentTokenSet(m));
    const baseW = Number(p.weight) > 0 ? Number(p.weight) : 1;
    const boost = Math.min(MAX_BOOST, overlap * PER_TOKEN_BOOST);
    return { user_id: uid, weight: baseW * (1 + boost) };
  });

  return pickHashStableWeighted(enriched, ctx);
}
