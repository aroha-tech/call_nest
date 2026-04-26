import { createDialerPublicClient } from './dialerPublicClient';

export function createBrowserExtensionDialerAdapter({ baseUrl, apiKey }) {
  const client = createDialerPublicClient({ baseUrl, apiKey });

  async function startFromPhoneNumber(phone, options = {}) {
    return client.clickToCall({
      contact_id: options.contactId || null,
      external_contact_id: options.externalContactId || null,
      external_crm: options.externalCrm || 'browser_extension',
      notes: options.notes || `Extension click-to-call (${phone})`,
      provider: options.provider || 'exotel',
    });
  }

  return {
    ...client,
    startFromPhoneNumber,
  };
}
