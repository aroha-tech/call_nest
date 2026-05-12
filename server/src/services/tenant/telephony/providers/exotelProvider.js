import { randomUUID } from 'crypto';
import { env } from '../../../../config/env.js';

/**
 * Resolve Exotel credentials for this call. Order of precedence:
 *   1. `credentials` arg passed in by the caller (BYO: per-tenant config from tenant_telephony_accounts)
 *   2. server env (`EXOTEL_*` — the platform's default Exotel account)
 *
 * Returns a shape ready to talk to the Exotel REST API.
 */
function resolveExotelCredentials(credentials = null) {
  const sid =
    String(credentials?.exotel_sid || credentials?.sid || env.telephony.exotelSid || '').trim();
  const apiKey =
    String(credentials?.exotel_api_key || credentials?.api_key || env.telephony.exotelApiKey || '').trim();
  const apiToken =
    String(credentials?.exotel_api_token || credentials?.api_token || env.telephony.exotelApiToken || '').trim();
  const subdomain =
    String(credentials?.exotel_subdomain || credentials?.subdomain || env.telephony.exotelSubdomain || '').trim();

  if (!sid || !apiKey || !apiToken || !subdomain) {
    const err = new Error(
      'Exotel provider not configured. Either configure tenant BYO account or set EXOTEL_SID, EXOTEL_API_KEY, EXOTEL_API_TOKEN and EXOTEL_SUBDOMAIN on the server.'
    );
    err.status = 500;
    throw err;
  }

  const recordCalls =
    credentials?.exotel_record_calls != null
      ? Boolean(credentials.exotel_record_calls)
      : env.telephony.exotelRecordCalls;
  const recordingChannels =
    String(credentials?.exotel_recording_channels || env.telephony.exotelRecordingChannels || '').trim() || '';

  return {
    sid,
    apiKey,
    apiToken,
    subdomain,
    recordCalls,
    recordingChannels,
  };
}

function buildStatusCallback({ statusCallbackOverride = null, webhookToken = null }) {
  // Per-tenant webhook routing: append the tenant's webhook_token so the callback is unambiguous.
  if (statusCallbackOverride) return String(statusCallbackOverride).trim();
  const base = `${String(env.apiBaseUrl || '').replace(/\/$/, '')}/api/public/telephony/exotel/status`;
  const envOverride = String(env.telephony.exotelStatusCallbackUrl || '').trim();
  const baseUrl = envOverride || base;
  if (webhookToken) {
    const sep = baseUrl.includes('?') ? '&' : '/';
    return `${baseUrl}${sep}${encodeURIComponent(webhookToken)}`;
  }
  return baseUrl;
}

function toFormBody(payload) {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined || v === null || v === '') continue;
    form.set(k, String(v));
  }
  return form.toString();
}

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

  /**
   * Place an outbound call.
   *
   * @param {object} args
   * @param {string} args.to                       Destination E.164 phone.
   * @param {object} [args.metadata]               Caller/leg overrides.
   * @param {object|null} [args.credentials]       Per-tenant credentials (BYO). null/undefined falls back to env.
   * @param {string|null} [args.webhookToken]      Tenant webhook routing token to append to the StatusCallback URL.
   * @param {string|null} [args.statusCallbackOverride] Full StatusCallback override for this account.
   */
  async startOutboundCall({ to, metadata = {}, credentials = null, webhookToken = null, statusCallbackOverride = null }) {
    if (!to) {
      const err = new Error('Missing destination number');
      err.status = 400;
      throw err;
    }
    const { sid, apiKey, apiToken, subdomain, recordCalls, recordingChannels } =
      resolveExotelCredentials(credentials);
    const statusCallback = buildStatusCallback({ statusCallbackOverride, webhookToken });

    const envCaller = String(env.telephony.exotelCallerId || '').trim();
    const envLeg = String(env.telephony.exotelAgentLeg || '').trim();
    const callerId = String(metadata.exotelCallerId || '').trim() || envCaller;
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
    if (recordCalls) {
      base.Record = 'true';
      if (recordingChannels) base.RecordingChannels = recordingChannels;
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
