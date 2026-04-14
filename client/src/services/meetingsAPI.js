import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/meetings';

export const meetingsAPI = {
  /**
   * Calendar: pass `from` + `to` (omit `page`). Paginated list: pass `page` (≥1), optional `limit`, `search`.
   * @param {{ from?: string, to?: string, email_account_id?: string|number, page?: number, limit?: number, search?: string }} [params]
   */
  list: (params) => axiosInstance.get(BASE, { params }),

  /** @param {{ email_account_id?: string|number }} [params] */
  metrics: (params) => axiosInstance.get(`${BASE}/metrics`, { params }),

  getById: (id) => axiosInstance.get(`${BASE}/${id}`),

  create: (data) => axiosInstance.post(BASE, data),

  update: (id, data) => axiosInstance.put(`${BASE}/${id}`, data),

  delete: (id) => axiosInstance.delete(`${BASE}/${id}`),

  /** @returns {Promise<{ data: { data: object[], placeholder_help: string[] } }>} */
  getEmailTemplates: () => axiosInstance.get(`${BASE}/email-templates`),

  /**
   * Resolved preview for current meeting + optional unsaved template draft.
   * @param {{ template_kind: string, meeting: object, template_override?: { subject?: string, body_html?: string|null, body_text?: string|null } }} body
   */
  previewEmailTemplate: (body) => axiosInstance.post(`${BASE}/email-templates/preview`, body),

  /** @param {{ templates: { template_kind: string, subject: string, body_html?: string|null, body_text?: string|null }[] }} body */
  putEmailTemplates: (body) => axiosInstance.put(`${BASE}/email-templates`, body),

  /** @param {{ template_kind: 'created'|'updated'|'cancelled' }} body */
  resetEmailTemplate: (body) => axiosInstance.post(`${BASE}/email-templates/reset`, body),
};
