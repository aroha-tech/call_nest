import { randomUUID } from 'crypto';
import { env } from '../../../../config/env.js';

function requireOzonetelConfig() {
  const endpoint = env.telephony.ozonetelApiUrl || 'https://in1-ccaas-api.ozonetel.com/ca_apis/AgentManualDial';
  const apiKey = env.telephony.ozonetelApiKey;
  const userName = env.telephony.ozonetelUserName;
  const agentId = env.telephony.ozonetelAgentId;
  const campaignName = env.telephony.ozonetelCampaignName;
  if (!endpoint || !apiKey || !userName || !agentId || !campaignName) {
    const err = new Error(
      'Ozonetel provider not configured. Set OZONETEL_API_KEY, OZONETEL_USERNAME, OZONETEL_AGENT_ID, and OZONETEL_CAMPAIGN_NAME.'
    );
    err.status = 500;
    throw err;
  }
  return { endpoint, apiKey, userName, agentId, campaignName };
}

function parseJsonSafe(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const ozonetelProvider = {
  code: 'ozonetel',

  async startOutboundCall({ to, metadata = {} }) {
    const { endpoint, apiKey, userName, agentId, campaignName } = requireOzonetelConfig();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userName,
        agentID: agentId,
        campaignName,
        customerNumber: to,
        UCID: 'true',
        uui: JSON.stringify({
          trace_id: metadata?.trace || randomUUID(),
          tenant_id: metadata?.tenantId ?? null,
          contact_id: metadata?.contactId ?? null,
          user_id: metadata?.userId ?? null,
        }),
      }),
    });

    const text = await response.text();
    const data = parseJsonSafe(text);
    if (!response.ok) {
      const err = new Error(data?.message || `Ozonetel call create failed (${response.status})`);
      err.status = 502;
      throw err;
    }

    const statusText = String(data?.status || '').toLowerCase();
    const status =
      statusText.includes('queue') || statusText.includes('success') ? 'queued' : statusText || 'queued';
    return {
      provider_call_id: data?.ucid || data?.call_id || `ozonetel_${randomUUID()}`,
      status,
      metadata: data && typeof data === 'object' ? data : null,
    };
  },
};

