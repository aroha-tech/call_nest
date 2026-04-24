import { axiosInstance } from './axiosInstance';

export const notificationAPI = {
  list: (params = {}) => axiosInstance.get('/api/tenant/notifications', { params }),
  unreadCount: () => axiosInstance.get('/api/tenant/notifications/unread-count'),
  vapidPublicKey: () => axiosInstance.get('/api/tenant/notifications/vapid-public-key'),
  markRead: (id) => axiosInstance.patch(`/api/tenant/notifications/${id}/read`),
  markAllRead: () => axiosInstance.patch('/api/tenant/notifications/read-all'),
  dismiss: (id) => axiosInstance.patch(`/api/tenant/notifications/${id}/dismiss`),
  dismissAll: (payload = {}) => axiosInstance.patch('/api/tenant/notifications/dismiss-all', payload),
  listPreferences: () => axiosInstance.get('/api/tenant/notifications/preferences/list'),
  upsertPreference: (payload) => axiosInstance.put('/api/tenant/notifications/preferences', payload),
  registerPushSubscription: (payload) => axiosInstance.post('/api/tenant/notifications/push-subscriptions', payload),
  unregisterPushSubscription: (endpoint) =>
    axiosInstance.delete('/api/tenant/notifications/push-subscriptions', { data: { endpoint } }),
};

