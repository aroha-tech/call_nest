import { randomUUID } from 'crypto';
import { env } from '../../../../config/env.js';

function formBody(params) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    search.set(k, String(v));
  }
  return search.toString();
}

function requireTwilioConfig() {
  const accountSid = env.telephony.twilioAccountSid;
  const authToken = env.telephony.twilioAuthToken;
  const fromNumber = env.telephony.twilioFromNumber;
  if (!accountSid || !authToken || !fromNumber) {
    const err = new Error(
      'Twilio provider not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.'
    );
    err.status = 500;
    throw err;
  }
  return { accountSid, authToken, fromNumber };
}

export const twilioProvider = {
  code: 'twilio',

  async startOutboundCall({ to, metadata = {} }) {
    if (!to) {
      const err = new Error('Missing destination number');
      err.status = 400;
      throw err;
    }

    const { accountSid, authToken, fromNumber } = requireTwilioConfig();
    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;
    const statusCallback = env.telephony.twilioStatusCallbackUrl || '';
    const callbackUrl = env.telephony.twilioCallUrl || '';

    const basic = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const body = formBody({
      To: to,
      From: fromNumber,
      Url: callbackUrl || undefined,
      StatusCallback: statusCallback || undefined,
      StatusCallbackMethod: statusCallback ? 'POST' : undefined,
      MachineDetection: 'DetectMessageEnd',
      Timeout: 25,
      // Keep a trace id for correlating provider callbacks and internal attempts.
      CallerIdLookup: 'false',
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      const err = new Error(data?.message || `Twilio call create failed (${response.status})`);
      err.status = 502;
      throw err;
    }

    return {
      provider_call_id: data?.sid || `twilio_${randomUUID()}`,
      status: 'queued',
      metadata: {
        twilio_status: data?.status || null,
        trace: metadata?.trace || null,
      },
    };
  },
};
