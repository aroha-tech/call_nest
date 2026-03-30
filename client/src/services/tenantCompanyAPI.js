import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/company';

export const tenantCompanyAPI = {
  get: () => axiosInstance.get(BASE),
  update: (body) => axiosInstance.put(BASE, body),
};
