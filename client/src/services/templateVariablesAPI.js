import { axiosInstance } from './axiosInstance';

/**
 * Template variables are system-level.
 * Used by template editors (Email, WhatsApp, SMS, Call Scripts).
 */
export const templateVariablesAPI = {
  /**
   * Get active variables grouped by module.
   * @returns {Promise<Record<string, Array<{ key: string, label: string }>>>}
   */
  getGrouped: () => axiosInstance.get('/api/template-variables'),

  /**
   * Get variable_key -> sample_value for preview. Merge with DEFAULT_PREVIEW_DATA for full coverage.
   * @returns {Promise<Record<string, string>>}
   */
  getPreviewSample: () => axiosInstance.get('/api/template-variables/preview-sample'),

  /**
   * Validate variable keys in template text or explicit list.
   * @param {{ text?: string, variables?: string[] }} payload
   * @returns {Promise<{ valid: boolean, invalidVariables?: string[], error?: string }>}
   */
  validate: (payload) =>
    axiosInstance.post('/api/template-variables/validate', payload),
};
