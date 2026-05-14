import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { TenantTelephonyBillingDetailView } from './PlatformTenantTelephonyPage';
import styles from './PlatformTenantTelephonyPage.module.scss';

/**
 * Full-page telephony billing editor for a single tenant (super-admin).
 */
export function PlatformTenantTelephonyTenantPage() {
  const { tenantId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const idNum = Number(tenantId);
  const valid = Number.isFinite(idNum) && idNum > 0;

  const [resolvedName, setResolvedName] = useState(null);

  useEffect(() => {
    setResolvedName(null);
  }, [idNum]);

  const onTenantMetaLoaded = useCallback((meta) => {
    if (meta?.name) setResolvedName(String(meta.name));
  }, []);

  const tenant = useMemo(() => {
    if (!valid) return null;
    const st = location.state && typeof location.state === 'object' ? location.state : {};
    return {
      id: idNum,
      name: st.name,
      slug: st.slug,
    };
  }, [valid, idNum, location.state]);

  const title = useMemo(() => {
    if (!valid) return 'Tenant telephony billing';
    const name = resolvedName || tenant?.name || tenant?.slug;
    return name ? `Telephony billing — ${name}` : `Telephony billing — tenant #${idNum}`;
  }, [valid, resolvedName, tenant?.name, tenant?.slug, idNum]);

  if (!valid) {
    return (
      <div className={styles.page}>
        <Alert variant="error">Invalid tenant id.</Alert>
        <Button variant="secondary" onClick={() => navigate('/admin/telephony-billing')}>
          Back to list
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title={title}
        subtitle={`tenant #${idNum}`}
        titleIcon="call"
        actions={
          <Button variant="secondary" onClick={() => navigate('/admin/telephony-billing')}>
            Back to tenants
          </Button>
        }
      />
      <TenantTelephonyBillingDetailView
        tenant={tenant}
        onTenantMetaLoaded={onTenantMetaLoaded}
      />
    </div>
  );
}
