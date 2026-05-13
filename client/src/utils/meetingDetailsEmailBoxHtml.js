/**
 * Mirrors server `buildMeetingDetailsBoxHtmlFromFields` so in-app preview matches outbound HTML.
 */

function escapeHtml(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeHtmlAttr(s) {
  return escapeHtml(s).replace(/`/g, '&#96;');
}

export function buildMeetingDetailsBoxHtmlFromFields(fields) {
  const title = escapeHtml(String(fields?.title || '').trim() || 'Meeting');
  const date = escapeHtml(String(fields?.date || '').trim() || '—');
  const timeLine = escapeHtml(String(fields?.timeLine || '').trim() || '—');
  const platform = escapeHtml(String(fields?.platform || '').trim() || 'Meeting');
  const link = String(fields?.link || '').trim();
  const safeHref = /^https?:\/\//i.test(link) ? escapeHtmlAttr(link) : '';
  const linkLabel = escapeHtml(link);
  const linkHtml = safeHref
    ? `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${linkLabel}</a>`
    : '—';
  const joinCta = safeHref
    ? `<p style="margin:14px 0 0;"><a href="${safeHref}" target="_blank" rel="noopener noreferrer" ` +
      `style="display:inline-block;padding:10px 18px;border-radius:10px;background:#2563eb;color:#ffffff;` +
      `font-weight:600;font-size:14px;text-decoration:none;">Join meeting</a></p>`
    : '';
  return (
    `<div style="margin-top:16px;padding:14px 16px;border-radius:12px;` +
    `background:#f5f7ff;border:1px solid #dbe3ff;font-size:13px;line-height:1.45;color:#1f2937;">` +
    `<p style="margin:0 0 10px;font-weight:700;font-size:13px;color:#111827;">Meeting details</p>` +
    `<table role="presentation" style="width:100%;border-collapse:collapse;">` +
    `<tr><td style="padding:3px 0;width:92px;color:#64748b;font-weight:600;">Title</td><td style="padding:3px 0;">${title}</td></tr>` +
    `<tr><td style="padding:3px 0;width:92px;color:#64748b;font-weight:600;">Date</td><td style="padding:3px 0;">${date}</td></tr>` +
    `<tr><td style="padding:3px 0;width:92px;color:#64748b;font-weight:600;">Time</td><td style="padding:3px 0;">${timeLine}</td></tr>` +
    `<tr><td style="padding:3px 0;width:92px;color:#64748b;font-weight:600;">Platform</td><td style="padding:3px 0;">${platform}</td></tr>` +
    `<tr><td style="padding:3px 0;width:92px;color:#64748b;font-weight:600;">Link</td><td style="padding:3px 0;">${linkHtml}</td></tr>` +
    `</table>${joinCta}</div>`
  );
}
