import { axiosInstance } from './axiosInstance';

export const taskManagerAPI = {
  listTemplates: (params = {}) => axiosInstance.get('/api/tenant/task-manager/templates', { params }),
  createTemplate: (payload) => axiosInstance.post('/api/tenant/task-manager/templates', payload),
  listAssignments: (params = {}) => axiosInstance.get('/api/tenant/task-manager/assignments', { params }),
  createAssignment: (payload) => axiosInstance.post('/api/tenant/task-manager/assignments', payload),
  deleteAssignment: (id) => axiosInstance.delete(`/api/tenant/task-manager/assignments/${id}`),
  listAssignmentComments: (id) => axiosInstance.get(`/api/tenant/task-manager/assignments/${id}/comments`),
  addAssignmentComment: (id, comment) => axiosInstance.post(`/api/tenant/task-manager/assignments/${id}/comments`, { comment }),
  listDailyLogs: (params = {}) => axiosInstance.get('/api/tenant/task-manager/daily-logs', { params }),
  recomputeLogs: (payload = {}) => axiosInstance.post('/api/tenant/task-manager/daily-logs/recompute', payload),
  updateAgentNote: (id, note) => axiosInstance.patch(`/api/tenant/task-manager/daily-logs/${id}/agent-note`, { note }),
  updateManagerNote: (id, note) => axiosInstance.patch(`/api/tenant/task-manager/daily-logs/${id}/manager-note`, { note }),
  listNoteHistory: (id) => axiosInstance.get(`/api/tenant/task-manager/daily-logs/${id}/note-history`),
  getSummary: (params = {}) => axiosInstance.get('/api/tenant/task-manager/reports/summary', { params }),
  getCalendar: (params = {}) => axiosInstance.get('/api/tenant/task-manager/reports/calendar', { params }),
  getTrend: (params = {}) => axiosInstance.get('/api/tenant/task-manager/reports/trend', { params }),
  getCoachingInsights: (params = {}) => axiosInstance.get('/api/tenant/task-manager/reports/coaching-insights', { params }),
  exportCsv: (params = {}) =>
    axiosInstance.get('/api/tenant/task-manager/reports/export.csv', { params, responseType: 'blob' }),
  getScoringConfig: () => axiosInstance.get('/api/tenant/task-manager/scoring-config'),
  updateScoringConfig: (payload) => axiosInstance.put('/api/tenant/task-manager/scoring-config', payload),
};
