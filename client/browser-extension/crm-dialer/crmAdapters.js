// Global adapter registry for CRM-specific extraction.
// Exposed as window.CallNestCrmAdapters so content.js can use it without bundling.
(function initCallNestCrmAdapters() {
  const HOST_MAP = {
    'zoho.com': 'zoho_crm',
    'hubspot.com': 'hubspot',
    'salesforce.com': 'salesforce',
    'pipedrive.com': 'pipedrive',
    'freshworks.com': 'freshsales',
    'zendesk.com': 'zendesk',
    'monday.com': 'monday_crm'
  };

  function detectCrmFromHost(hostname) {
    const host = String(hostname || '').toLowerCase();
    for (const suffix of Object.keys(HOST_MAP)) {
      if (host.endsWith(suffix)) return HOST_MAP[suffix];
    }
    return 'generic_crm';
  }

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function pickFirstText(root, selectors) {
    for (const selector of selectors) {
      const el = root?.querySelector?.(selector);
      const txt = cleanText(el?.textContent || el?.innerText || '');
      if (txt) return txt;
    }
    return null;
  }

  function zohoAdapter(node) {
    const record = node.closest('[data-zcqa], [data-id], .record, .cv-row, tr, li, .zcrm-tableRow');
    const url = window.location.href;
    const urlId = (url.match(/(?:\/tab\/\w+\/|\/record\/)(\d{6,})/i) || [])[1] || null;
    const attrId = record?.getAttribute('data-id') || record?.getAttribute('data-zcqa') || null;
    const name =
      pickFirstText(record || document, ['[data-zcqa*="name"]', '.cv_name', '.record-name', 'h1', 'h2']) || null;
    return { externalContactId: urlId || attrId, contactName: name };
  }

  function hubspotAdapter(node) {
    const record = node.closest('[data-object-id], [data-test-id], tr, li, .private-record, .record');
    const attrId = record?.getAttribute('data-object-id') || record?.getAttribute('data-test-id') || null;
    const url = window.location.href;
    const urlId = (url.match(/\/contacts\/(\d+)/i) || [])[1] || null;
    const name =
      pickFirstText(record || document, ['[data-field="fullname"]', '.private-contact-name', 'h1', 'h2']) || null;
    return { externalContactId: urlId || attrId, contactName: name };
  }

  function salesforceAdapter(node) {
    const record = node.closest('[data-recordid], [data-row-key-value], tr, li, .slds-card');
    const attrId = record?.getAttribute('data-recordid') || record?.getAttribute('data-row-key-value') || null;
    const url = window.location.href;
    const urlId = (url.match(/\/([a-zA-Z0-9]{15,18})(?:\/|$)/) || [])[1] || null;
    const name =
      pickFirstText(record || document, ['[data-target-selection-name="sfdc:RecordField.Contact.Name"]', 'h1', 'h2']) || null;
    return { externalContactId: attrId || urlId, contactName: name };
  }

  function pipedriveAdapter(node) {
    const record = node.closest('[data-test], [data-id], [data-person-id], tr, li, .personRow, .detailsPanel');
    const attrId =
      record?.getAttribute('data-person-id') ||
      record?.getAttribute('data-id') ||
      record?.getAttribute('data-test') ||
      null;
    const url = window.location.href;
    const personUrlId = (url.match(/\/person\/(\d+)/i) || [])[1] || null;
    const name =
      pickFirstText(record || document, ['[data-test="person-name"]', '.personName', '.details-panel-title', 'h1', 'h2']) ||
      null;
    return { externalContactId: personUrlId || attrId, contactName: name };
  }

  function freshsalesAdapter(node) {
    const record = node.closest('[data-id], [data-test-id], [data-contact-id], tr, li, .record, .contact-card');
    const attrId =
      record?.getAttribute('data-contact-id') ||
      record?.getAttribute('data-id') ||
      record?.getAttribute('data-test-id') ||
      null;
    const url = window.location.href;
    const urlId =
      (url.match(/\/contacts\/(\d+)/i) || [])[1] ||
      (url.match(/\/leads\/(\d+)/i) || [])[1] ||
      null;
    const name =
      pickFirstText(record || document, ['[data-test-id="contact-name"]', '.contact-name', '.entity-name', 'h1', 'h2']) ||
      null;
    return { externalContactId: urlId || attrId, contactName: name };
  }

  function genericAdapter(node) {
    const card = node.closest('[data-id], [data-zcqa], [data-object-id], tr, li, .record, .contact, .entity');
    const text = cleanText(card?.innerText || '');
    const nameMatch = text.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}/);
    return {
      externalContactId:
        card?.getAttribute('data-id') ||
        card?.getAttribute('data-zcqa') ||
        card?.getAttribute('data-object-id') ||
        null,
      contactName: nameMatch ? nameMatch[0] : null
    };
  }

  const ADAPTERS = {
    zoho_crm: zohoAdapter,
    hubspot: hubspotAdapter,
    salesforce: salesforceAdapter,
    pipedrive: pipedriveAdapter,
    freshsales: freshsalesAdapter,
    generic_crm: genericAdapter
  };

  window.CallNestCrmAdapters = {
    detectCrmFromHost,
    getContext(node, crmCode) {
      const fn = ADAPTERS[crmCode] || ADAPTERS.generic_crm;
      return fn(node) || { externalContactId: null, contactName: null };
    }
  };
})();
