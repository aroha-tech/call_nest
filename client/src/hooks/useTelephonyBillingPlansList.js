import { useCallback, useEffect, useRef, useState } from 'react';
import { telephonyBillingPlansAdminAPI } from '../services/tenantTelephonyAdminAPI';
import { EMPTY_PLANS } from '../constants/emptyCollections';

/**
 * Loads telephony billing plans once per param change (no useCallback/load identity loops).
 */
export function useTelephonyBillingPlansList(params, { enabled = true } = {}) {
  const [plans, setPlans] = useState(EMPTY_PLANS);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const requestIdRef = useRef(0);

  const reload = useCallback(() => {
    setRefreshToken((t) => t + 1);
  }, []);

  const {
    plan_category: planCategory = '',
    plan_type: planType,
    search = '',
    include_inactive: includeInactive = 'false',
    page = 1,
    limit = 12,
  } = params || {};

  useEffect(() => {
    if (!enabled || !planCategory) {
      setPlans(EMPTY_PLANS);
      setTotal(0);
      setLoading(false);
      return undefined;
    }

    const requestId = ++requestIdRef.current;
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await telephonyBillingPlansAdminAPI.list(
          {
            plan_category: planCategory,
            plan_type: planType || undefined,
            search: search || undefined,
            include_inactive: includeInactive,
            page,
            limit,
          },
          { signal: controller.signal }
        );
        if (cancelled || requestId !== requestIdRef.current) return;
        setPlans(res.data?.data || EMPTY_PLANS);
        setTotal(res.data?.pagination?.total || 0);
      } catch (e) {
        if (cancelled || requestId !== requestIdRef.current) return;
        if (e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') return;
        setError(e?.response?.data?.error || e.message || 'Failed to load plans');
        setPlans(EMPTY_PLANS);
        setTotal(0);
      } finally {
        if (!cancelled && requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, planCategory, planType, search, includeInactive, page, limit, refreshToken]);

  return { plans, total, loading, error, setError, reload };
}
