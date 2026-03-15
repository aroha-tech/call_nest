import { useState, useEffect } from 'react';
import { useTenant } from '../context/TenantContext';
import { emailSettingsAPI } from '../services/emailAPI';

/**
 * Returns whether the email module is enabled for the current tenant (purchased).
 * When false, the client should hide the entire email module (nav, routes).
 * GET /api/tenant/email/settings is allowed even when module is disabled.
 */
export function useEmailModuleEnabled() {
  const { isPlatform } = useTenant();
  const [emailModuleEnabled, setEmailModuleEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isPlatform) {
      setEmailModuleEnabled(true);
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    emailSettingsAPI
      .getSettings()
      .then((res) => {
        if (mounted) {
          setEmailModuleEnabled(!!res.data?.data?.emailModuleEnabled);
        }
      })
      .catch(() => {
        if (mounted) {
          setEmailModuleEnabled(false);
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [isPlatform]);

  return { emailModuleEnabled, loading };
}
