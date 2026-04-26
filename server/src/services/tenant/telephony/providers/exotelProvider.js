import { randomUUID } from 'crypto';
import { env } from '../../../../config/env.js';

function requireExotelConfig() {
  const sid = env.telephony.exotelSid;
  const apiKey = env.telephony.exotelApiKey;
  const apiToken = env.telephony.exotelApiToken;
  const subdomain = env.telephony.exotelSubdomain;
  const callerId = env.telephony.exotelCallerId;
  if (!sid || !apiKey || !apiToken || !subdomain || !callerId) {
    const err = new Error(
      'Exotel provider not configured. Set EXOTEL_SID, EXOTEL_API_KEY, EXOTEL_API_TOKEN, EXOTEL_SUBDOMAIN, and EXOTEL_CALLER_ID.'
    );
    err.status = 500;
    throw err;
  }
  return { sid, apiKey, apiToken, subdomain, callerId };
}

function toFormBody(payload) {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined || v === null || v === '') continue;
    form.set(k, String(v));
  }
  return form.toString();
}

export const exotelProvider = {
  code: 'exotel',

  async startOutboundCall({ to }) {
    if (!to) {
      const err = new Error('Missing destination number');
      err.status = 400;
      throw err;
    }
    const { sid, apiKey, apiToken, subdomain, callerId } = requireExotelConfig();
    const endpoint = `https://${subdomain}/v1/Accounts/${sid}/Calls/connect.json`;
    const basicAuth = Buffer.from(`${apiKey}:${apiToken}`).toString('base64');
    const payload = toFormBody({
      From: to,
      To: callerId,
      CallerId: callerId,
      CallType: 'trans',
      TimeLimit: 3600,
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: payload,
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      const err = new Error(data?.message || `Exotel call create failed (${response.status})`);
      err.status = 502;
      throw err;
    }

    const callSid = data?.Call?.Sid || data?.sid || `exotel_${randomUUID()}`;
    const status = String(data?.Call?.Status || 'queued').toLowerCase();
    return {
      provider_call_id: callSid,
      status: status || 'queued',
    };
  },
};
