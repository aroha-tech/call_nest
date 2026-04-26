import { randomUUID } from 'crypto';
import { env } from '../../../../config/env.js';

function requireMyOperatorConfig() {
  const endpoint = env.telephony.myoperatorApiUrl;
  const authToken = env.telephony.myoperatorAuthToken;
  const agentNumber = env.telephony.myoperatorAgentNumber;
  const customerNumberField = env.telephony.myoperatorCustomerNumberField || 'customer_number';
  const callerId = env.telephony.myoperatorCallerId;
  if (!endpoint || !authToken || !callerId) {
    const err = new Error(
      'MyOperator provider not configured. Set MYOPERATOR_API_URL and MYOPERATOR_AUTH_TOKEN (plus optional MYOPERATOR_AGENT_NUMBER/MYOPERATOR_CALLER_ID).'
    );
    err.status = 500;
    throw err;
  }
  return { endpoint, authToken, callerId, agentNumber, customerNumberField };
}

function parseJsonSafe(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const myoperatorProvider = {
  code: 'myoperator',

  async startOutboundCall({ to, metadata = {} }) {
    const { endpoint, authToken, callerId, agentNumber, customerNumberField } = requireMyOperatorConfig();
    const url = new URL(endpoint);
    url.searchParams.set('token', authToken);

    // MyOperator does not publish one universal click-to-call payload in public docs.
    // Keep endpoint configurable while sending a common outbound structure most gateways accept.
    const payload = {
      caller_id: callerId,
      agent_number: agentNumber || callerId,
      [customerNumberField]: to,
      metadata: {
        trace_id: metadata?.trace || randomUUID(),
        tenant_id: metadata?.tenantId ?? null,
        contact_id: metadata?.contactId ?? null,
        user_id: metadata?.userId ?? null,
      },
    };

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    const data = parseJsonSafe(text);
    if (!response.ok) {
      const err = new Error(data?.message || `MyOperator call create failed (${response.status})`);
      err.status = 502;
      throw err;
    }

    const ok = String(data?.status || '').toLowerCase() === 'success';
    return {
      provider_call_id:
        data?.data?.id ||
        data?.data?.call_id ||
        data?.call_id ||
        `myoperator_${randomUUID()}`,
      status: ok ? 'queued' : String(data?.status || 'queued').toLowerCase(),
      metadata: data && typeof data === 'object' ? data : null,
    };
  },
};

