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

  /** Records join_opened_at when a user opens the meeting URL from the app. */
  recordJoinOpened: (id) => axiosInstance.post(`${BASE}/${id}/join-opened`),

  delete: (id) => axiosInstance.delete(`${BASE}/${id}`),

  /** @returns {Promise<{ data: { data: object[], placeholder_help: string[] } }>} */
  getEmailTemplates: () => axiosInstance.get(`${BASE}/email-templates`),

  /**
   * Resolved preview for current meeting + optional unsaved template draft.
   * @param {{ template_kind: string, meeting: object, template_override?: { subject?: string, body_html?: string|null, body_text?: string|null } }} body
   */
  previewEmailTemplate: (body) => axiosInstance.post(`${BASE}/email-templates/preview`, body),

  /**
   * Meeting modal: owner template + mail settings + resolved preview (matches outbound attendee mail).
   * @param {{ template_kind: 'created'|'updated'|'cancelled', meeting: object, template_override?: { subject?: string, body_html?: string|null, body_text?: string|null }, include_meeting_details?: boolean }} body
   */
  postAttendeeEmailWorkspace: (body) => axiosInstance.post(`${BASE}/attendee-email-workspace`, body),

  /** @param {{ templates: { template_kind: string, subject: string, body_html?: string|null, body_text?: string|null }[] }} body */
  putEmailTemplates: (body) => axiosInstance.put(`${BASE}/email-templates`, body),

  /** @param {{ template_kind: 'created'|'updated'|'cancelled' }} body */
  resetEmailTemplate: (body) => axiosInstance.post(`${BASE}/email-templates/reset`, body),

  /** @param {{ for_user_id?: number|string }} [params] */
  getDefaultEmailSettings: (params) => axiosInstance.get(`${BASE}/default-email-settings`, { params }),
  putDefaultEmailSettings: (body) => axiosInstance.put(`${BASE}/default-email-settings`, body),
  /** @param {{ type: 'reminder'|'feedback', to_email: string, email_account_id?: number }} body */
  sendDefaultSettingsTestEmail: (body) => axiosInstance.post(`${BASE}/default-email-settings/test-email`, body),

  getUserAttendeeEmailTemplates: () => axiosInstance.get(`${BASE}/user-attendee-email-templates`),
  /** @param {{ templates: object[], for_user_id?: number|string }} body */
  putUserAttendeeEmailTemplates: (body) => axiosInstance.put(`${BASE}/user-attendee-email-templates`, body),
  previewUserAttendeeEmailTemplate: (body) => axiosInstance.post(`${BASE}/user-attendee-email-templates/preview`, body),
  /** @param {{ template_kind: 'created'|'updated'|'cancelled', to_email: string, email_account_id?: number }} body */
  sendUserAttendeeEmailTemplateTestEmail: (body) =>
    axiosInstance.post(`${BASE}/user-attendee-email-templates/test-email`, body),
};
