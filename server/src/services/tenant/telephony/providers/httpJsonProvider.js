import { randomUUID } from 'crypto';

function readJsonSafe(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function startHttpJsonOutboundCall({
  providerCode,
  to,
  endpoint,
  authHeaderName = 'Authorization',
  authHeaderValue = '',
  callerId = '',
  extraHeaders = {},
  metadata = {},
}) {
  if (!to) {
    const err = new Error('Missing destination number');
    err.status = 400;
    throw err;
  }
  if (!endpoint) {
    const err = new Error(`${providerCode} provider endpoint is not configured`);
    err.status = 500;
    throw err;
  }

  const headers = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };
  if (authHeaderValue) headers[authHeaderName] = authHeaderValue;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      to,
      caller_id: callerId || null,
      metadata,
    }),
  });

  const text = await response.text();
  const data = readJsonSafe(text);
  if (!response.ok) {
    const err = new Error(data?.message || `${providerCode} call create failed (${response.status})`);
    err.status = 502;
    throw err;
  }

  return {
    provider_call_id:
      data?.provider_call_id ||
      data?.call_id ||
      data?.id ||
      `${providerCode}_${randomUUID()}`,
    status: String(data?.status || 'queued').toLowerCase(),
    metadata: data?.metadata && typeof data.metadata === 'object' ? data.metadata : null,
  };
}

