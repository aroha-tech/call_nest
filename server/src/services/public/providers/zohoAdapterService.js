import * as dialerPublicService from '../dialerPublicService.js';
import { getDefaultTelephonyProviderCode } from '../../tenant/telephony/telephonyProviderRegistry.js';

function mapZohoContact(record = {}) {
  const first = String(record.First_Name || '').trim();
  const last = String(record.Last_Name || '').trim();
  const name = `${first} ${last}`.trim() || record.Full_Name || record.Company || 'Zoho Lead';
  const phone = record.Phone || record.Mobile || record.WhatsApp || '';
  return {
    external_id: String(record.id || '').trim(),
    display_name: String(name).trim(),
    phone,
    email: record.Email || null,
    source: 'zoho_crm',
    notes: record.Description || null,
  };
}

export async function syncZohoContacts(app, payload = {}) {
  const records = Array.isArray(payload.data) ? payload.data : [];
  const contacts = records.map(mapZohoContact).filter((x) => x.external_id && x.phone);
  return dialerPublicService.upsertContactsFromCrm(app, {
    contacts,
    external_crm: 'zoho_crm',
    default_country_code: payload.default_country_code || '+91',
  });
}

export async function zohoClickToCall(app, payload = {}) {
  return dialerPublicService.clickToCall(app, {
    external_crm: 'zoho_crm',
    external_contact_id: payload.zoho_contact_id || payload.contact_id,
    notes: payload.notes || payload.subject || 'Zoho click-to-call',
    callback_url: payload.callback_url || null,
    provider: payload.provider || getDefaultTelephonyProviderCode(),
  });
}

export async function zohoWriteback(app, payload = {}) {
  return dialerPublicService.writeActivity(app, {
    call_attempt_id: payload.call_attempt_id,
    notes: payload.notes || null,
    disposition_id: payload.disposition_id || null,
  });
}
