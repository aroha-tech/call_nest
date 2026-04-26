import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/contact-blacklist';

export const contactBlacklistAPI = {
  list: ({ search, page = 1, limit = 20, block_scope } = {}) =>
    axiosInstance.get(BASE, {
      params: {
        search: search || undefined,
        page,
        limit,
        block_scope: block_scope || undefined,
      },
    }),

  add: (payload) => axiosInstance.post(BASE, payload),

  unblock: (id) => axiosInstance.patch(`${BASE}/${id}/unblock`),
};

