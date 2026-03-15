import { useState, useEffect, useCallback, useMemo } from 'react';
import { templateVariablesAPI } from '../services/templateVariablesAPI';
import { getAutocompleteContext, getSuggestionsForPrefix } from '../utils/templateVariables';

const MODULE_ORDER = ['contact', 'agent', 'company', 'system', 'link'];
const MODULE_LABELS = {
  contact: 'Contact Variables',
  agent: 'Agent Variables',
  company: 'Company Variables',
  system: 'System Variables',
  link: 'Link Variables',
};

/**
 * Fetch template variables grouped by module.
 * @returns {{ grouped: Record<string, Array<{ key: string, label: string }>>, flat: Array<{ key: string, label: string, module: string }>, loading: boolean, error: string | null, refetch: function }}
 */
export function useTemplateVariables() {
  const [grouped, setGrouped] = useState({});
  const [flat, setFlat] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchFn = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await templateVariablesAPI.getGrouped();
      const data = res.data || {};
      setGrouped(data);
      const all = [];
      MODULE_ORDER.forEach((mod) => {
        (data[mod] || []).forEach((v) => {
          all.push({ ...v, module: mod });
        });
      });
      setFlat(all);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load template variables');
      setGrouped({});
      setFlat([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFn();
  }, [fetchFn]);

  return {
    grouped,
    flat,
    moduleOrder: MODULE_ORDER,
    moduleLabels: MODULE_LABELS,
    loading,
    error,
    refetch: fetchFn,
  };
}

/**
 * Autocomplete state when user types {{ in a template editor.
 * Use with value + selectionStart (cursor position).
 *
 * @param {string} value - Full text of the field
 * @param {number} selectionStart - Cursor position
 * @returns {{ active: boolean, query: string, suggestions: Array<{ key: string, label: string }>, context: { startIndex: number } | null }}
 */
export function useTemplateVariableAutocomplete(value, selectionStart) {
  const { flat } = useTemplateVariables();
  return useMemo(() => {
    const ctx = getAutocompleteContext(value, selectionStart);
    if (!ctx) return { active: false, query: '', suggestions: [], context: null };
    const suggestions = getSuggestionsForPrefix(flat, ctx.query);
    return {
      active: true,
      query: ctx.query,
      suggestions,
      context: { startIndex: ctx.startIndex },
    };
  }, [value, selectionStart, flat]);
}
