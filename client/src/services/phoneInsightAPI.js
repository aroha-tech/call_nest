import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/phone-insight';

/**
 * Offline numbering-plan metadata only (no paid carrier lookup).
 * @param {string} phone - Raw or E.164
 * @param {string} [defaultCountry] - ISO2 when phone is national format
 */
export function phoneInsightAPIGet(phone, defaultCountry) {
  return axiosInstance.get(BASE, {
    params: {
      phone: phone ?? undefined,
      default_country: defaultCountry || undefined,
    },
  });
}

export const phoneInsightAPI = {
  get: phoneInsightAPIGet,
};
