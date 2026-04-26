import { createDialerPublicClient } from './dialerPublicClient';

export function createEmbeddedWidgetSDK({ baseUrl, apiKey, targetWindow = window.parent }) {
  const client = createDialerPublicClient({ baseUrl, apiKey });

  function post(event, payload) {
    if (!targetWindow || typeof targetWindow.postMessage !== 'function') return;
    targetWindow.postMessage(
      {
        source: 'callnest-widget',
        event,
        payload,
      },
      '*'
    );
  }

  return {
    ...client,
    notifyReady() {
      post('widget.ready', { at: new Date().toISOString() });
    },
    notifyCallStarted(callData) {
      post('call.started', callData);
    },
  };
}
