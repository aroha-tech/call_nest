import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/contact-delete-policy';

export const contactDeletePolicyAPI = {
  get: () => axiosInstance.get(BASE),
  update: (body) => axiosInstance.put(BASE, body),
};
