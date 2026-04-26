document.getElementById('openSettings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

function setText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value == null || value === '' ? '-' : String(value);
}

function renderCandidates(list) {
  const root = document.getElementById('phoneCandidates');
  if (!root) return;
  if (!Array.isArray(list) || list.length === 0) {
    root.textContent = 'No phone candidates found.';
    return;
  }
  root.innerHTML = '';
  list.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `<div><b>${item.phone || '-'}</b> (${item.source || 'unknown'})</div>
      <div>Name: ${item.contactName || '-'}</div>
      <div>ID: ${item.externalContactId || '-'}</div>`;
    root.appendChild(div);
  });
}

async function runInspector() {
  setText('crmCode', 'Inspecting...');
  setText('contactName', '-');
  setText('externalContactId', '-');
  renderCandidates([]);

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs?.[0];
  if (!tab?.id) {
    setText('crmCode', 'No active tab');
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: 'CALLNEST_DEBUG_CONTEXT' }, (response) => {
    if (chrome.runtime.lastError) {
      setText('crmCode', 'Unavailable');
      renderCandidates([]);
      return;
    }
    if (!response?.ok) {
      setText('crmCode', 'Failed');
      setText('contactName', response?.error || '-');
      return;
    }
    setText('crmCode', response.crmCode);
    setText('contactName', response.contactName);
    setText('externalContactId', response.externalContactId);
    renderCandidates(response.phoneCandidates || []);
  });
}

document.getElementById('runInspector').addEventListener('click', runInspector);
