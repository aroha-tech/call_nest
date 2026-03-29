import React, { useState, useCallback } from 'react';
import {
  getTenantWorkspaceHost,
  getTenantWorkspaceUrl,
  getPlatformAdminHost,
  getPlatformAdminUrl,
} from '../../config/tenantWorkspaceUrl';
import { copyToClipboard } from '../../utils/copyToClipboard';
import styles from './TenantWorkspaceUrlCopy.module.scss';

/**
 * Shows workspace hostname + copy full URL (tenant row or platform admin row).
 */
export function TenantWorkspaceUrlCopy({ tenantId, slug }) {
  const [copied, setCopied] = useState(false);
  const isPlatform = tenantId === 1;
  const host = isPlatform ? getPlatformAdminHost() : getTenantWorkspaceHost(slug);
  const url = isPlatform ? getPlatformAdminUrl() : getTenantWorkspaceUrl(slug);

  const onCopy = useCallback(async () => {
    if (!url) return;
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }, [url]);

  if (!host) {
    return <span className={styles.muted}>—</span>;
  }

  return (
    <div className={styles.wrap} title={isPlatform ? 'Super admin console URL' : 'Tenant sign-in URL (open in browser)'}>
      <code className={styles.host}>{host}</code>
      <button type="button" className={styles.copyBtn} onClick={onCopy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
