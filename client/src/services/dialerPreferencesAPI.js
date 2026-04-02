import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/dialer-preferences';

export const dialerPreferencesAPI = {
  get: () => axiosInstance.get(BASE),
  update: (body) => axiosInstance.put(BASE, body),
};
