import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/lead-import-distribution';

export const leadImportDistributionAPI = {
  get: () => axiosInstance.get(BASE),
  put: (body) => axiosInstance.put(BASE, body),
};
