import { dummyProvider } from './providers/dummyProvider.js';

/**
 * Provider registry so swapping providers is isolated.
 * Later: add exotelProvider, twilioProvider, etc.
 */
const PROVIDERS = new Map([[dummyProvider.code, dummyProvider]]);

export function getTelephonyProvider(code = 'dummy') {
  const key = String(code || 'dummy').trim().toLowerCase();
  return PROVIDERS.get(key) || dummyProvider;
}

