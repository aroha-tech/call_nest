import React from 'react';
import { useTenant } from '../../context/TenantContext';

function getModeLabel({ isPlatform, isTenant, isMarketing }) {
  if (isPlatform) return 'Platform admin';
  if (isTenant) return 'Tenant app';
  if (isMarketing) return 'Marketing';
  return 'Unknown';
}

export function DevTenantBanner() {
  // Only render in development builds.
  if (typeof import.meta !== 'undefined' && !import.meta.env.DEV) {
    return null;
  }

  const { tenantSlug, isPlatform, isTenant, isMarketing } = useTenant();

  let devOverride = null;
  if (typeof window !== 'undefined') {
    try {
      devOverride = window.localStorage.getItem('dev_tenant');
    } catch {
      devOverride = null;
    }
  }

  const modeLabel = getModeLabel({ isPlatform, isTenant, isMarketing });
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';

  return (
    <></>
    // <div
    //   style={{
    //     position: 'fixed',
    //     insetInline: 16,
    //     bottom: 16,
    //     zIndex: 50,
    //     maxWidth: 420,
    //     marginInline: 'auto',
    //     padding: '8px 12px',
    //     borderRadius: 999,
    //     background: 'rgba(15, 23, 42, 0.92)',
    //     color: '#e5e7eb',
    //     fontSize: 12,
    //     display: 'flex',
    //     alignItems: 'center',
    //     justifyContent: 'space-between',
    //     gap: 8,
    //     border: '1px solid rgba(148, 163, 184, 0.6)',
    //     boxShadow: '0 10px 25px rgba(15, 23, 42, 0.7)',
    //     pointerEvents: 'none',
    //   }}
    // >
    //   <span>
    //     <strong style={{ fontWeight: 600 }}>Dev mode:</strong> {modeLabel}
    //     {tenantSlug ? ` · slug: ${tenantSlug}` : ''}
    //     {devOverride ? ` · dev_tenant=${devOverride}` : ''}
    //   </span>
    //   <span style={{ opacity: 0.7 }}>host: {hostname}</span>
    // </div>
  );
}

