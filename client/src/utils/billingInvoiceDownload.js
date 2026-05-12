/**
 * Generates a print-friendly HTML invoice/receipt and triggers download.
 * Users can open the file and use Print → Save as PDF for a PDF copy.
 */

import { PRODUCT_DISPLAY_NAME } from '../config/productBrand';

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoney(paise, currency = 'INR') {
  const n = Number(paise) / 100;
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR' }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function formatDisplayDate(isoOrSql, fallback = '—') {
  if (!isoOrSql) return fallback;
  const d = new Date(String(isoOrSql).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * @param {object} opts
 * @param {object} opts.payment - Row from tenant payment list API
 * @param {string} [opts.customerEmail]
 * @param {string} [opts.workspaceLabel] - e.g. tenant subdomain
 * @param {string} [opts.productName]
 */
export function downloadPaymentInvoiceHtml(opts) {
  const { payment, customerEmail, workspaceLabel, productName = PRODUCT_DISPLAY_NAME } = opts || {};
  if (!payment) return;

  const invoiceNo = payment.razorpay_payment_id || `INV-${payment.id}`;
  const statusLabel = String(payment.status || '').replace(/_/g, ' ');
  const title = escapeHtml(productName);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Invoice ${escapeHtml(invoiceNo)} — ${title}</title>
  <style>
    :root {
      --ink: #0f172a;
      --muted: #64748b;
      --line: #e2e8f0;
      --accent: #4f46e5;
      --ok: #059669;
      --bad: #dc2626;
    }
    * { box-sizing: border-box; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      color: var(--ink);
      margin: 0;
      padding: 48px;
      background: #f8fafc;
    }
    .sheet {
      max-width: 720px;
      margin: 0 auto;
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 40px 48px;
      box-shadow: 0 4px 24px rgba(15, 23, 42, 0.06);
    }
    .brand {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      margin-bottom: 32px;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--line);
    }
    .brand h1 {
      margin: 0 0 6px;
      font-size: 22px;
      letter-spacing: -0.02em;
    }
    .brand p { margin: 0; color: var(--muted); font-size: 13px; }
    .badge {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      border: 1px solid var(--line);
      background: #f1f5f9;
      color: var(--ink);
    }
    .badge.ok { background: #ecfdf5; border-color: #a7f3d0; color: var(--ok); }
    .badge.bad { background: #fef2f2; border-color: #fecaca; color: var(--bad); }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 28px 32px;
      margin-bottom: 32px;
    }
    @media (max-width: 560px) {
      .grid { grid-template-columns: 1fr; }
      body { padding: 16px; }
      .sheet { padding: 28px 24px; }
    }
    dt {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      margin: 0 0 6px;
      font-weight: 600;
    }
    dd { margin: 0; font-size: 15px; font-weight: 500; }
    .total {
      margin-top: 8px;
      padding-top: 20px;
      border-top: 2px solid var(--ink);
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 16px;
    }
    .total span:first-child { font-size: 14px; color: var(--muted); }
    .total strong { font-size: 26px; letter-spacing: -0.03em; color: var(--accent); }
    .footer {
      margin-top: 36px;
      padding-top: 20px;
      border-top: 1px dashed var(--line);
      font-size: 12px;
      color: var(--muted);
      line-height: 1.6;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .sheet { box-shadow: none; border: none; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="brand">
      <div>
        <h1>${title}</h1>
        <p>Tax invoice / Payment receipt</p>
      </div>
      <div>
        <span class="badge ${payment.status === 'captured' ? 'ok' : payment.status === 'failed' ? 'bad' : ''}">${escapeHtml(statusLabel)}</span>
        <p style="margin:12px 0 0;text-align:right;font-size:13px;color:var(--muted)">Invoice #<br/><strong style="color:var(--ink);font-size:14px">${escapeHtml(invoiceNo)}</strong></p>
      </div>
    </div>

    <div class="grid">
      <div>
        <dl>
          <dt>Bill to</dt>
          <dd>${escapeHtml(customerEmail || '—')}</dd>
        </dl>
        ${workspaceLabel ? `<dl><dt>Workspace</dt><dd>${escapeHtml(workspaceLabel)}</dd></dl>` : ''}
      </div>
      <div>
        <dl>
          <dt>Issue date</dt>
          <dd>${escapeHtml(formatDisplayDate(payment.created_at))}</dd>
        </dl>
        <dl>
          <dt>Plan</dt>
          <dd>${escapeHtml(payment.plan_name || 'Subscription')}</dd>
        </dl>
      </div>
    </div>

    <dl>
      <dt>Payment details</dt>
      <dd style="font-family:ui-monospace,monospace;font-size:13px;line-height:1.7">
        Order: ${escapeHtml(payment.razorpay_order_id || '—')}<br/>
        Payment id: ${escapeHtml(payment.razorpay_payment_id || '—')}<br/>
        ${payment.payment_method ? `Method: ${escapeHtml(payment.payment_method)}` : ''}
      </dd>
    </dl>

    <div class="total">
      <span>Amount charged</span>
      <strong>${escapeHtml(formatMoney(payment.amount_paise, payment.currency))}</strong>
    </div>

    <div class="footer">
      This document was generated from your billing history. For official tax documentation, retain emails from your payment provider if applicable.
      <br/><br/>
      ${title} · Thank you for your business.
    </div>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const safeName = String(invoiceNo).replace(/[^\w.-]+/g, '_');
  const a = document.createElement('a');
  a.href = url;
  a.download = `invoice-${safeName}.html`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
