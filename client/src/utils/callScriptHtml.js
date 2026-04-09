export function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function looksLikeHtml(s) {
  const str = String(s || '').trim();
  if (!str) return false;
  return /<\/?[a-z][\s\S]*>/i.test(str);
}

export function extractTemplateKeys(text) {
  const out = new Set();
  const s = String(text || '');
  const mustache = /\{\{\s*([^}]+?)\s*\}\}/g;
  let m;
  while ((m = mustache.exec(s)) !== null) {
    const inner = String(m[1] || '').trim();
    const pipe = inner.indexOf('|');
    const key = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
    if (key) out.add(key);
  }
  const bracket = /\[\s*([a-zA-Z0-9_]+)\s*\]/g;
  while ((m = bracket.exec(s)) !== null) {
    const key = String(m[1] || '').trim();
    if (key) out.add(key);
  }
  return [...out];
}

/**
 * Render script body with variable substitution for dialer / preview UIs.
 */
export function renderScriptHtml(body, contact, agent, tenant, sampleMap) {
  const raw = String(body || '');
  const displayName = contact?.display_name || contact?.first_name || contact?.email || '';
  const firstName = contact?.first_name || (displayName || '').split(' ')[0] || '';
  const lastName = contact?.last_name || (displayName || '').split(' ').slice(1).join(' ') || '';
  const phone = contact?.primary_phone || '';
  const email = contact?.email || '';
  const tenantCompanyName = tenant?.company_name || tenant?.name || '';
  const company = contact?.company || tenantCompanyName || '';
  const city = contact?.city || '';
  const agentName = agent?.name || agent?.full_name || agent?.display_name || agent?.first_name || agent?.email || '';
  const agentEmail = agent?.email || '';
  const companyPhone = tenant?.phone || tenant?.company_phone || '';
  const companyEmail = tenant?.email || tenant?.company_email || '';

  const now = new Date();
  const todayDate = now.toLocaleDateString(undefined, { dateStyle: 'medium' });
  const currentTime = now.toLocaleTimeString(undefined, { timeStyle: 'short' });

  const base = {
    contact_name: displayName,
    display_name: displayName,
    contact_first_name: firstName,
    contact_last_name: lastName,
    contact_phone: phone,
    contact_email: email,
    contact_full_name: displayName,
    company_name: company,
    company_phone: companyPhone,
    company_email: companyEmail,
    city: city,
    agent_name: agentName,
    agent_email: agentEmail,
    today_date: todayDate,
    current_time: currentTime,
    customer: displayName,
    customer_name: displayName,
  };
  const merged = { ...(sampleMap || {}), ...base };

  const valueOrFallback = (key, fallback) => {
    const v = merged[key];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
    if (fallback !== undefined && fallback !== null && String(fallback).trim() !== '') return String(fallback).trim();
    return '';
  };

  const applyVars = (text) =>
    String(text)
      .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|\s*([^}]+?)\s*)?\}\}/g, (_, k, fb) => valueOrFallback(k, fb))
      .replace(/\[\s*([a-zA-Z0-9_]+)\s*\]/g, (_, k) => valueOrFallback(k));

  const substituted = applyVars(raw);

  if (looksLikeHtml(substituted)) {
    return substituted;
  }

  return escapeHtml(substituted).replace(/\r\n|\r|\n/g, '<br/>');
}
