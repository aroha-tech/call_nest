import { axiosInstance } from './axiosInstance';

export const reportsHubAPI = {
  getContext: (params = {}) => axiosInstance.get('/api/tenant/reports/context', { params }),
  getKpiSummary: (params = {}) => axiosInstance.get('/api/tenant/reports/kpi-summary', { params }),
  getTeams: (params = {}) => axiosInstance.get('/api/tenant/reports/teams', { params }),
  getLeaderboard: (params = {}) => axiosInstance.get('/api/tenant/reports/leaderboard', { params }),
  getInsights: (params = {}) => axiosInstance.get('/api/tenant/reports/insights', { params }),
};
