import { dummyProvider } from './providers/dummyProvider.js';
import { twilioProvider } from './providers/twilioProvider.js';
import { exotelProvider } from './providers/exotelProvider.js';
import { knowlarityProvider } from './providers/knowlarityProvider.js';
import { myoperatorProvider } from './providers/myoperatorProvider.js';
import { ozonetelProvider } from './providers/ozonetelProvider.js';
import { env } from '../../../config/env.js';

/**
 * Provider registry so swapping providers is isolated.
 * Later: add exotelProvider, twilioProvider, etc.
 */
const PROVIDERS = new Map([
  [dummyProvider.code, dummyProvider],
  [twilioProvider.code, twilioProvider],
  [exotelProvider.code, exotelProvider],
  [knowlarityProvider.code, knowlarityProvider],
  [myoperatorProvider.code, myoperatorProvider],
  [ozonetelProvider.code, ozonetelProvider],
]);

export function getDefaultTelephonyProviderCode() {
  const configured = String(env.telephony.defaultProvider || 'exotel')
    .trim()
    .toLowerCase();
  if (PROVIDERS.has(configured)) return configured;
  return 'exotel';
}

export function getTelephonyProvider(code = null) {
  const key = String(code || getDefaultTelephonyProviderCode())
    .trim()
    .toLowerCase();
  return PROVIDERS.get(key) || PROVIDERS.get(getDefaultTelephonyProviderCode()) || dummyProvider;
}

