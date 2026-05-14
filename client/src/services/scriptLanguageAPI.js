import { axiosInstance } from './axiosInstance';

/** Built-in NLLB + long scripts can exceed default axios timeout (first run downloads models). */
const TRANSLATE_TIMEOUT_MS = 600_000;

export const scriptLanguageAPI = {
  getStatus: () => axiosInstance.get('/api/tenant/script-language/status'),
  translate: (payload) =>
    axiosInstance.post('/api/tenant/script-language/translate', payload, {
      timeout: TRANSLATE_TIMEOUT_MS,
    }),
  transcribe: (formData) =>
    axiosInstance.post('/api/tenant/script-language/transcribe', formData),
  tts: (payload) =>
    axiosInstance.post('/api/tenant/script-language/tts', payload, {
      responseType: 'blob',
    }),
};
