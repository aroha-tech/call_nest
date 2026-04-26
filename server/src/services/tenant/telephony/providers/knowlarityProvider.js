import { randomUUID } from 'crypto';
import { env } from '../../../../config/env.js';

function requireKnowlarityConfig() {
  const endpoint = env.telephony.knowlarityApiUrl || 'https://kpi.knowlarity.com/Basic/v1/account/call/makecall';
  const apiKey = env.telephony.knowlarityApiKey;
  const authToken = env.telephony.knowlarityAuthToken;
  const kNumber = env.telephony.knowlarityKNumber;
  const countryCode = env.telephony.knowlarityCountryCode || 'IN';
  const callerId = env.telephony.knowlarityCallerId;
  if (!endpoint || !apiKey || !authToken || !kNumber || !callerId) {
    const err = new Error(
      'Knowlarity provider not configured. Set KNOWLARITY_API_KEY, KNOWLARITY_AUTH_TOKEN, KNOWLARITY_K_NUMBER, and KNOWLARITY_CALLER_ID.'
    );
    err.status = 500;
    throw err;
  }
  return { endpoint, apiKey, authToken, kNumber, countryCode, callerId };
}

function parseJsonSafe(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const knowlarityProvider = {
  code: 'knowlarity',

  async startOutboundCall({ to, metadata = {} }) {
    const { endpoint, apiKey, authToken, kNumber, countryCode, callerId } = requireKnowlarityConfig();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: authToken,
        'x-api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        k_number: kNumber,
        agent_number: callerId,
        customer_number: to,
        caller_id: callerId,
        country_code: countryCode,
        additional_params: {
          trace_id: metadata?.trace || randomUUID(),
          tenant_id: metadata?.tenantId ?? null,
          contact_id: metadata?.contactId ?? null,
          user_id: metadata?.userId ?? null,
        },
      }),
    });

    const text = await response.text();
    const data = parseJsonSafe(text);
    if (!response.ok) {
      const err = new Error(data?.message || `Knowlarity call create failed (${response.status})`);
      err.status = 502;
      throw err;
    }

    return {
      provider_call_id:
        data?.call_id ||
        data?.ucid ||
        data?.id ||
        data?.data?.call_id ||
        `knowlarity_${randomUUID()}`,
      status: 'queued',
      metadata: data && typeof data === 'object' ? data : null,
    };
  },
};

