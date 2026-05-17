import { useCallback, useEffect, useState } from 'react';
import { tenantTelephonyAPI } from '../services/tenantTelephonyAPI';

/**
 * Loads tenant call-credit balance + usage for dialer surfaces.
 * Silently no-ops when the user lacks permission (403).
 */
export function useDialerCredits({ enabled = true, refreshIntervalMs = 0 } = {}) {
  const [balance, setBalance] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const [balRes, useRes] = await Promise.all([
        tenantTelephonyAPI.getBalance(),
        tenantTelephonyAPI.getUsage(),
      ]);
      setBalance(balRes?.data?.data ?? balRes?.data ?? null);
      setUsage(useRes?.data?.data ?? useRes?.data ?? null);
      setForbidden(false);
    } catch (e) {
      const status = e?.response?.status;
      if (status === 403 || status === 401) {
        setForbidden(true);
        setBalance(null);
        setUsage(null);
      }
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    if (!refreshIntervalMs || refreshIntervalMs < 5000) return undefined;
    const id = window.setInterval(refresh, refreshIntervalMs);
    return () => window.clearInterval(id);
  }, [enabled, refresh, refreshIntervalMs]);

  return { balance, usage, loading, forbidden, refresh };
}
