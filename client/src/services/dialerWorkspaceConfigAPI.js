import { axiosInstance } from './axiosInstance';

const BASE = '/api/tenant/dialer-workspace-config';

/** Mirrors server defaults — used when GET fails or before load. */
export function mergeDialerWorkspaceConfig(stored) {
  const o = stored && typeof stored === 'object' ? stored : {};
  return {
    show_activity_tab: o.show_activity_tab !== false,
    show_email_tab: o.show_email_tab === true,
    show_website_tab: o.show_website_tab === true,
    allow_edit_contact_in_session: o.allow_edit_contact_in_session !== false,
  };
}

export const dialerWorkspaceConfigAPI = {
  get: () => axiosInstance.get(BASE),
  update: (body) => axiosInstance.put(BASE, body),
};
