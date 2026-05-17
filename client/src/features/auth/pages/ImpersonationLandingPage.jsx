import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppDispatch } from '../../../app/hooks';
import { impersonationSessionStart } from '../authSlice';
import { exchangeImpersonationCode } from '../impersonationAPI';
import { userAndTenantFromToken } from '../utils/jwtUtils';
import { Alert } from '../../../components/ui/Alert';
import authUi from '../components/authFormShared.module.scss';

/**
 * Tenant subdomain entry: exchange one-time code and start support session.
 */
export function ImpersonationLandingPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState(null);

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      setError('Invalid support link.');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const data = await exchangeImpersonationCode(code);
        if (cancelled) return;
        const { user, tenant, permissions, tokenVersion } = userAndTenantFromToken(data.access_token);
        dispatch(
          impersonationSessionStart({
            user: { ...user, isImpersonation: true },
            tenant,
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            permissions,
            tokenVersion,
            impersonatorId: data.impersonator_id,
          })
        );
        navigate('/', { replace: true });
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.error || err.message || 'Could not open workspace');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, dispatch, navigate]);

  return (
    <div className={authUi.shell} style={{ padding: '2rem 0', textAlign: 'center' }}>
      {error ? (
        <Alert variant="error" display="inline">
          {error}
        </Alert>
      ) : (
        <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>Opening workspace…</p>
      )}
    </div>
  );
}
