const PHONE_REGEX = /(?:\+?\d[\d\s\-().]{7,}\d)/g;
const BUTTON_CLASS = 'callnest-crm-dial-btn';
const PROCESSED_ATTR = 'data-callnest-processed';
const injectedKeys = new Set();
const adapters = window.CallNestCrmAdapters || {
  detectCrmFromHost: () => 'generic_crm',
  getContext: () => ({ externalContactId: null, contactName: null })
};

function toDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

function phoneKey(phone) {
  return toDigits(phone).slice(-12);
}

function showToast(message, variant = 'info') {
  let root = document.getElementById('callnest-toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'callnest-toast-root';
    root.style.position = 'fixed';
    root.style.top = '14px';
    root.style.right = '14px';
    root.style.zIndex = '2147483647';
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.gap = '8px';
    document.documentElement.appendChild(root);
  }
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.padding = '8px 10px';
  toast.style.borderRadius = '6px';
  toast.style.color = '#fff';
  toast.style.fontSize = '12px';
  toast.style.maxWidth = '340px';
  toast.style.background = variant === 'error' ? '#b42318' : variant === 'success' ? '#067647' : '#344054';
  root.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

function sendLog(level, event, details = {}) {
  chrome.runtime.sendMessage({
    type: 'CALLNEST_LOG',
    payload: { level, event, details }
  });
}

function extractPhones(text) {
  if (!text) return [];
  const matches = text.match(PHONE_REGEX) || [];
  return [...new Set(matches.map((m) => String(m).trim()).filter(Boolean))];
}

function findContactContext(node) {
  const hostname = window.location.hostname;
  const crmCode = adapters.detectCrmFromHost(hostname);
  const adapterContext = adapters.getContext(node, crmCode);
  return {
    crmCode,
    contactName: adapterContext.contactName || null,
    externalContactId: adapterContext.externalContactId || null
  };
}

function createDialButton(phone, context) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = BUTTON_CLASS;
  button.textContent = 'Call';
  button.title = `Call ${phone} via Call Nest`;
  button.style.marginLeft = '6px';
  button.style.padding = '2px 6px';
  button.style.fontSize = '11px';
  button.style.cursor = 'pointer';
  button.style.border = '1px solid #d0d7de';
  button.style.borderRadius = '4px';
  button.style.background = '#ffffff';
  button.style.color = '#1f2328';

  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const initial = button.textContent;
    button.textContent = 'Calling...';
    button.disabled = true;
    chrome.runtime.sendMessage(
      {
        type: 'CALLNEST_DIAL',
        payload: {
          phone,
          pageUrl: window.location.href,
          externalContactId: context.externalContactId,
          contactName: context.contactName
        }
      },
      (response) => {
        if (chrome.runtime.lastError) {
          button.textContent = 'Error';
          button.title = chrome.runtime.lastError.message;
          showToast(`Call failed: ${chrome.runtime.lastError.message}`, 'error');
          sendLog('error', 'content.call_runtime_error', { message: chrome.runtime.lastError.message });
        } else if (!response?.ok) {
          button.textContent = 'Failed';
          button.title = response?.error || 'Dial failed';
          showToast(`Call failed: ${response?.error || 'Dial failed'}`, 'error');
          sendLog('error', 'content.call_failed', { error: response?.error || 'Dial failed', phone });
        } else {
          button.textContent = 'Called';
          button.title = `Queued in ${response.crmCode}`;
          showToast(`Call queued (${response.crmCode})`, 'success');
          sendLog('info', 'content.call_success', { crmCode: response.crmCode, phone: response.phoneE164 || phone });
        }
        setTimeout(() => {
          button.textContent = initial;
          button.disabled = false;
        }, 1800);
      }
    );
  });

  return button;
}

function attachToTelLinks(root) {
  const links = root.querySelectorAll('a[href^="tel:"]:not([data-callnest-processed])');
  links.forEach((link) => {
    const href = link.getAttribute('href') || '';
    const phone = href.replace(/^tel:/i, '').trim();
    if (!phone) return;
    const context = findContactContext(link);
    const key = `tel:${phoneKey(phone)}:${context.externalContactId || 'na'}`;
    if (injectedKeys.has(key)) {
      link.setAttribute(PROCESSED_ATTR, '1');
      return;
    }
    if (link.nextElementSibling?.classList?.contains(BUTTON_CLASS)) {
      link.setAttribute(PROCESSED_ATTR, '1');
      return;
    }
    const button = createDialButton(phone, context);
    link.after(button);
    injectedKeys.add(key);
    link.setAttribute(PROCESSED_ATTR, '1');
  });
}

function attachToTextNodes(root) {
  const nodes = root.querySelectorAll('span, div, td, p, li');
  nodes.forEach((node) => {
    if (node.getAttribute(PROCESSED_ATTR) === '1') return;
    if (node.children.length > 0) return;
    const phones = extractPhones(node.textContent);
    if (!phones.length) return;
    const firstPhone = phones[0];
    const context = findContactContext(node);
    const key = `txt:${phoneKey(firstPhone)}:${context.externalContactId || 'na'}`;
    if (injectedKeys.has(key)) {
      node.setAttribute(PROCESSED_ATTR, '1');
      return;
    }
    if (node.querySelector(`.${BUTTON_CLASS}`)) {
      node.setAttribute(PROCESSED_ATTR, '1');
      return;
    }
    const button = createDialButton(firstPhone, context);
    node.appendChild(button);
    injectedKeys.add(key);
    node.setAttribute(PROCESSED_ATTR, '1');
  });
}

function scan(root = document) {
  attachToTelLinks(root);
  attachToTextNodes(root);
}

function collectPhoneCandidates(limit = 20) {
  const candidates = [];
  const seen = new Set();

  const telLinks = Array.from(document.querySelectorAll('a[href^="tel:"]'));
  for (const link of telLinks) {
    const phone = (link.getAttribute('href') || '').replace(/^tel:/i, '').trim();
    if (!phone) continue;
    const key = phoneKey(phone);
    if (!key || seen.has(key)) continue;
    const ctx = findContactContext(link);
    seen.add(key);
    candidates.push({
      phone,
      contactName: ctx.contactName || null,
      externalContactId: ctx.externalContactId || null,
      source: 'tel_link'
    });
    if (candidates.length >= limit) return candidates;
  }

  const nodes = Array.from(document.querySelectorAll('span, div, td, p, li'));
  for (const node of nodes) {
    let text = String(node.textContent || '');
    if (!text) continue;
    // Remove extension button labels so candidate parsing remains stable after injection.
    text = text.replace(/\b(Call|Calling\.\.\.|Called|Failed|Error)\b/g, ' ').trim();
    const phones = extractPhones(text);
    for (const phone of phones) {
      const key = phoneKey(phone);
      if (!key || seen.has(key)) continue;
      const ctx = findContactContext(node);
      seen.add(key);
      candidates.push({
        phone,
        contactName: ctx.contactName || null,
        externalContactId: ctx.externalContactId || null,
        source: 'text'
      });
      if (candidates.length >= limit) return candidates;
    }
  }

  return candidates;
}

function buildDebugInfo() {
  const crmCode = adapters.detectCrmFromHost(window.location.hostname);
  const baseContext = findContactContext(document.body);
  return {
    ok: true,
    crmCode,
    url: window.location.href,
    contactName: baseContext.contactName || null,
    externalContactId: baseContext.externalContactId || null,
    phoneCandidates: collectPhoneCandidates(20)
  };
}

const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const n of m.addedNodes) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        scan(n);
      }
    }
  }
});

scan(document);
sendLog('info', 'content.scan_started', { host: window.location.hostname, url: window.location.href });
observer.observe(document.documentElement || document.body, {
  childList: true,
  subtree: true
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'CALLNEST_DEBUG_CONTEXT') return false;
  try {
    sendResponse(buildDebugInfo());
  } catch (err) {
    sendResponse({ ok: false, error: err?.message || 'Failed to inspect page' });
  }
  return false;
});
