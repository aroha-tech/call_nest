import { useState, useEffect } from 'react';
import { useTenant } from '../context/TenantContext';
import { emailSettingsAPI } from '../services/emailAPI';

/**
 * In-memory cache so every route mount does not refetch / flash loading.
 * Keyed by tenant hostname slug (TenantContext); cleared when tenant key changes.
 */
let emailModuleCache = {
  tenantKey: null,
  emailModuleEnabled: true,
  loaded: false,
};

/**
 * Returns whether the email module is enabled for the current tenant (purchased).
 * When false, the client should hide the entire email module (nav, routes).
 * GET /api/tenant/email/settings is allowed even when module is disabled.
 */
export function useEmailModuleEnabled() {
  const { isPlatform, tenantSlug } = useTenant();
  const tenantKey = isPlatform ? '__platform__' : tenantSlug || '';

  const [emailModuleEnabled, setEmailModuleEnabled] = useState(() => {
    if (isPlatform) return true;
    if (emailModuleCache.loaded && emailModuleCache.tenantKey === tenantKey) {
      return emailModuleCache.emailModuleEnabled;
    }
    return true;
  });
  const [loading, setLoading] = useState(() => {
    if (isPlatform) return false;
    if (emailModuleCache.loaded && emailModuleCache.tenantKey === tenantKey) return false;
    return true;
  });

  useEffect(() => {
    if (isPlatform) {
      setEmailModuleEnabled(true);
      setLoading(false);
      return;
    }
    if (emailModuleCache.loaded && emailModuleCache.tenantKey === tenantKey) {
      setEmailModuleEnabled(emailModuleCache.emailModuleEnabled);
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);
    emailSettingsAPI
      .getSettings()
      .then((res) => {
        const enabled = !!res.data?.data?.emailModuleEnabled;
        emailModuleCache = { tenantKey, emailModuleEnabled: enabled, loaded: true };
        if (mounted) {
          setEmailModuleEnabled(enabled);
        }
      })
      .catch(() => {
        emailModuleCache = { tenantKey, emailModuleEnabled: false, loaded: true };
        if (mounted) {
          setEmailModuleEnabled(false);
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [isPlatform, tenantKey]);

  return { emailModuleEnabled, loading };
}
