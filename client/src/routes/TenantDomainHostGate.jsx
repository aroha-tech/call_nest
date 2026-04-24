import React, { useEffect, useState } from 'react';
import { useTenant } from '../context/TenantContext';
import { fetchWorkspaceHostStatus } from '../services/publicDiscoveryAPI';
import { Spinner } from '../components/ui/Spinner';
import { UnknownWorkspacePage } from '../pages/UnknownWorkspacePage';
import gateStyles from './TenantDomainHostGate.module.scss';

/**
 * On real tenant subdomains, verifies the slug exists before rendering tenant routes.
 * Avoids showing a broken login when the subdomain is a typo (e.g. acmew vs acme).
 */
export function TenantDomainHostGate({ children }) {
  const { isTenant } = useTenant();
  const [phase, setPhase] = useState('loading'); // loading | ok | unknown | disabled
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    if (!isTenant) {
      setPhase('ok');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const data = await fetchWorkspaceHostStatus();
        if (cancelled) return;
        if (data?.skipped) {
          setPhase('ok');
          return;
        }
        if (data?.state === 'ok') {
          setPhase('ok');
          return;
        }
        if (data?.state === 'disabled') {
          setPayload({ slug: data.slug, tenantName: data.tenantName });
          setPhase('disabled');
          return;
        }
        if (data?.state === 'unknown_subdomain') {
          setPayload({ slug: data.slug });
          setPhase('unknown');
          return;
        }
        setPhase('ok');
      } catch {
        if (!cancelled) {
          // If the check fails (network), allow the app to load — existing flows may still show errors
          setPhase('ok');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isTenant]);

  if (!isTenant) {
    return children;
  }

  if (phase === 'loading') {
    return (
      <div className={gateStyles.loading} role="status" aria-live="polite">
        <Spinner size="lg" />
        <span className={gateStyles.loadingText}>Checking workspace…</span>
      </div>
    );
  }

  if (phase === 'unknown') {
    return <UnknownWorkspacePage reason="unknown" attemptedSlug={payload?.slug || ''} />;
  }

  if (phase === 'disabled') {
    return (
      <UnknownWorkspacePage
        reason="disabled"
        attemptedSlug={payload?.slug || ''}
        tenantName={payload?.tenantName}
      />
    );
  }

  return children;
}
