import axios from 'axios';
import { axiosInstance } from '../../services/axiosInstance';

const apiBase =
  (import.meta.env.VITE_API_BASE_URL ?? '') ||
  (typeof window !== 'undefined' ? window.location.origin : '');

export const impersonationAdminAPI = {
  start: (userId) => axiosInstance.post('/api/admin/impersonate', { userId }),
};

export async function exchangeImpersonationCode(code) {
  const { data } = await axios.post(`${apiBase}/api/auth/impersonation/exchange`, { code });
  return data;
}

export async function refreshImpersonationToken(refreshToken) {
  const { data } = await axios.post(`${apiBase}/api/auth/impersonation/refresh`, { refreshToken });
  return data;
}

export async function endImpersonationSession(refreshToken) {
  await axios.post(`${apiBase}/api/auth/impersonation/end`, { refreshToken });
}
