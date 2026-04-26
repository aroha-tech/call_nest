import axios from 'axios';

export function createDialerPublicClient({ baseUrl, apiKey }) {
  const http = axios.create({
    baseURL: baseUrl || '',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
  });

  return {
    upsertContacts: (payload) => http.post('/api/public/v1/dialer/contacts/upsert', payload),
    clickToCall: (payload) => http.post('/api/public/v1/dialer/calls/click-to-call', payload),
    callLifecycle: (payload) => http.post('/api/public/v1/dialer/calls/lifecycle', payload),
    writebackActivity: (payload) => http.post('/api/public/v1/dialer/activities/writeback', payload),
    getDeliveries: (params) => http.get('/api/public/v1/dialer/events/deliveries', { params }),
    replayDelivery: (outboxId) => http.post(`/api/public/v1/dialer/events/replay/${outboxId}`),
  };
}
