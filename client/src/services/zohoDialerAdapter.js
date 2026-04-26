import { createDialerPublicClient } from './dialerPublicClient';

export function createZohoDialerAdapter({ baseUrl, apiKey }) {
  const client = createDialerPublicClient({ baseUrl, apiKey });

  return {
    syncContactsFromZoho: (zohoPayload) =>
      client.upsertContacts({
        external_crm: 'zoho_crm',
        contacts: Array.isArray(zohoPayload?.data) ? zohoPayload.data : [],
      }),
    clickToCallFromZoho: ({ zohoContactId, notes, provider }) =>
      client.clickToCall({
        external_crm: 'zoho_crm',
        external_contact_id: zohoContactId,
        notes,
        provider,
      }),
    writebackToZoho: (payload) => client.writebackActivity(payload),
  };
}
