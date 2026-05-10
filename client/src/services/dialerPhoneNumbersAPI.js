import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/dialer-phone-numbers';

export const dialerPhoneNumbersAPI = {
  list: () => axiosInstance.get(BASE),
  update: (id, body) => axiosInstance.put(`${BASE}/${id}`, body),
};
