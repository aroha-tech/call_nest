import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/saved-list-filters';

export const savedListFiltersAPI = {
  list: ({ entity_type }) =>
    axiosInstance.get(BASE, { params: { entity_type: entity_type || undefined } }),

  create: ({ entity_type, name, filter_json }) =>
    axiosInstance.post(BASE, { entity_type, name, filter_json }),

  update: (id, { name, filter_json }) => axiosInstance.put(`${BASE}/${id}`, { name, filter_json }),

  remove: (id) => axiosInstance.delete(`${BASE}/${id}`),
};
