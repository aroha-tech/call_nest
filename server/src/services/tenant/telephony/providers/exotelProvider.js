import { randomUUID } from 'crypto';
import { env } from '../../../../config/env.js';

function requireExotelApiCredentials() {
  const sid = env.telephony.exotelSid;
  const apiKey = env.telephony.exotelApiKey;
  const apiToken = env.telephony.exotelApiToken;
  const subdomain = env.telephony.exotelSubdomain;
  if (!sid || !apiKey || !apiToken || !subdomain) {
    const err = new Error(
      'Exotel provider not configured. Set EXOTEL_SID, EXOTEL_API_KEY, EXOTEL_API_TOKEN, and EXOTEL_SUBDOMAIN.'
    );
    err.status = 500;
    throw err;
  }
  const statusCallback =
    String(env.telephony.exotelStatusCallbackUrl || '').trim() ||
    `${String(env.apiBaseUrl || '').replace(/\/$/, '')}/api/public/telephony/exotel/status`;
  return { sid, apiKey, apiToken, subdomain, statusCallback };
}

function toFormBody(payload) {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined || v === null || v === '') continue;
    form.set(k, String(v));
  }
  return form.toString();
}

/** Map Exotel API / webhook raw status to DB enum values (see contact_call_attempts.status). */
function normalizeExotelCallStatus(raw) {
  const s = String(raw || 'queued')
    .trim()
    .toLowerCase();
  if (!s) return 'queued';
  if (['in-progress', 'inprogress'].includes(s)) return 'ringing';
  if (['queued', 'ringing', 'connected', 'completed', 'failed', 'cancelled', 'no_answer', 'busy'].includes(s)) {
    return s;
  }
  if (['no-answer', 'noanswer'].includes(s)) return 'no_answer';
  if (s === 'busy') return 'busy';
  if (['canceled', 'cancelled'].includes(s)) return 'cancelled';
  return 'queued';
}

export const exotelProvider = {
  code: 'exotel',

  async startOutboundCall({ to, metadata = {} }) {
    if (!to) {
      const err = new Error('Missing destination number');
      err.status = 400;
      throw err;
    }
    const { sid, apiKey, apiToken, subdomain, statusCallback } = requireExotelApiCredentials();
    const envCaller = String(env.telephony.exotelCallerId || '').trim();
    const envLeg = String(env.telephony.exotelAgentLeg || '').trim();
    const callerId =
      String(metadata.exotelCallerId || '').trim() || envCaller;
    const agentLeg = String(metadata.exotelAgentLeg || '').trim() || envLeg;

    if (!callerId) {
      const err = new Error(
        'Exotel Caller ID is not configured. Set workspace Calling settings, or EXOTEL_CALLER_ID on the server.'
      );
      err.status = 500;
      throw err;
    }

    const endpoint = `https://${subdomain}/v1/Accounts/${sid}/Calls/connect.json`;
    const basicAuth = Buffer.from(`${apiKey}:${apiToken}`).toString('base64');

    const base = {
      CallerId: callerId,
      CallType: 'trans',
      TimeLimit: 3600,
    };
    if (env.telephony.exotelRecordCalls) {
      base.Record = 'true';
      const ch = String(env.telephony.exotelRecordingChannels || '').trim();
      if (ch) base.RecordingChannels = ch;
    }
    if (statusCallback) {
      base.StatusCallback = statusCallback;
      base.StatusCallbackEvents = 'terminal,answered';
    }

    let payloadFields;
    if (agentLeg) {
      payloadFields = { ...base, From: agentLeg, To: to };
    } else {
      payloadFields = { ...base, From: to, To: callerId, CallerId: callerId };
    }

    const payload = toFormBody(payloadFields);

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
    const status = normalizeExotelCallStatus(data?.Call?.Status || data?.Status);
    return {
      provider_call_id: callSid,
      status,
    };
  },
};
