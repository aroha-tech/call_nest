import React, { createContext, useContext, useMemo } from 'react';
import {
  getSubdomain,
  isPlatformAdminDomain,
  isTenantDomain,
  isMarketingDomain,
} from '../utils/tenantResolver';

const TenantContext = createContext({
  tenantSlug: null,
  isPlatform: false,
  isTenant: false,
  isMarketing: false,
});

export function TenantProvider({ children }) {
  const value = useMemo(() => {
    const tenantSlug = getSubdomain();
    const isPlatform = isPlatformAdminDomain();
    const isMarketing = isMarketingDomain();
    const isTenant = isTenantDomain();

    return {
      tenantSlug,
      isPlatform,
      isTenant,
      isMarketing,
    };
  }, []);

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  return useContext(TenantContext);
}

