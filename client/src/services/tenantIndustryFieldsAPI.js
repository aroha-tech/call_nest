import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/industry-fields';

export const tenantIndustryFieldsAPI = {
  getDefinitions: () => axiosInstance.get(`${BASE}/definitions`),
  getOptionalSettings: () => axiosInstance.get(`${BASE}/optional-settings`),
  putOptionalSettings: (enabled_field_ids) =>
    axiosInstance.put(`${BASE}/optional-settings`, { enabled_field_ids }),
};
