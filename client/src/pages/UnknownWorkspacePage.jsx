import React, { useState, useCallback } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Alert } from '../components/ui/Alert';
import { MaterialSymbol } from '../components/ui/MaterialSymbol';
import {
  getTenantAppDomain,
  getTenantWorkspaceUrl,
  getPlatformAdminUrl,
} from '../config/tenantWorkspaceUrl';
import { lookupWorkspacesByEmail } from '../services/publicDiscoveryAPI';
import { copyToClipboard } from '../utils/copyToClipboard';
import authUi from '../features/auth/components/authFormShared.module.scss';
import styles from './UnknownWorkspacePage.module.scss';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function CopyUrlRow({ url, className = '' }) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }, [url]);

  return (
    <div className={`${styles.urlRow} ${className}`.trim()}>
      <code className={styles.urlCode} title={url}>
        {url}
      </code>
      <div className={styles.urlActions}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className={styles.copyBtn}
          onClick={onCopy}
        >
          {copied ? 'Copied' : 'Copy link'}
        </Button>
        <a className={styles.openLink} href={url} rel="noopener noreferrer">
          Open
        </a>
      </div>
    </div>
  );
}

/**
 * Shown when the browser hostname uses a tenant slug that does not exist (or workspace is disabled).
 */
export function UnknownWorkspacePage({ reason, attemptedSlug, tenantName }) {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [result, setResult] = useState(null);

  const domain = getTenantAppDomain();
  const isDisabled = reason === 'disabled';
  const mainSiteUrl = domain ? `https://www.${domain}` : null;

  const onSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setApiError('');
      setResult(null);
      const trimmed = email.trim().toLowerCase();
      if (!trimmed) {
        setFieldError('Enter the email you use to sign in.');
        return;
      }
      if (!EMAIL_REGEX.test(trimmed)) {
        setFieldError('Enter a valid email address.');
        return;
      }
      setFieldError('');
      setLoading(true);
      try {
        const data = await lookupWorkspacesByEmail(trimmed);
        setResult(data);
      } catch (err) {
        const msg = err.response?.data?.error || err.message || 'Something went wrong. Try again.';
        setApiError(msg);
      } finally {
        setLoading(false);
      }
    },
    [email]
  );

  if (isDisabled) {
    return (
      <div className={styles.standaloneShell}>
        <div className={authUi.shell}>
          <div className={`${styles.page} ${styles.pageDisabled}`}>
            <div className={styles.heroIconWarn} aria-hidden>
              <MaterialSymbol name="domain_disabled" className={styles.heroIconGlyph} />
            </div>
            <p className={styles.eyebrow}>Workspace status</p>
            <h1 className={styles.title}>This workspace isn&apos;t available</h1>
            <p className={styles.lead}>
              <strong className={styles.slugEmphasis}>{attemptedSlug}</strong>
              {tenantName ? (
                <>
                  {' '}
                  <span className={styles.mutedParen}>({tenantName})</span>
                </>
              ) : null}{' '}
              has been turned off by your organization. You can&apos;t sign in here until an administrator turns it back
              on.
            </p>

            <div className={styles.disabledPanel}>
              <p className={styles.panelTitle}>What you can do</p>
              <ul className={styles.tipList}>
                <li>Contact your company admin or IT help desk and ask them to re-enable the workspace.</li>
                <li>Confirm you&apos;re using the sign-in link they sent you (check spelling in the address bar).</li>
                {mainSiteUrl ? (
                  <li>
                    Visit the{' '}
                    <a href={mainSiteUrl} rel="noreferrer">
                      main site
                    </a>{' '}
                    for general information while you wait.
                  </li>
                ) : null}
              </ul>
            </div>

            {mainSiteUrl ? (
              <a href={mainSiteUrl} rel="noreferrer" className={styles.mainCta}>
                Back to main site
              </a>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const platformLoginUrl = `${getPlatformAdminUrl()}/login`;

  return (
    <div className={styles.standaloneShell}>
      <div className={authUi.shell}>
        <div className={`${styles.page} ${styles.pageUnknown}`}>
        <div className={styles.heroIconInfo} aria-hidden>
          <MaterialSymbol name="travel_explore" className={styles.heroIconGlyph} />
        </div>
        <p className={styles.eyebrow}>Workspace</p>
        <h1 className={styles.title}>We couldn&apos;t find that workspace</h1>
        <p className={styles.lead}>
          There is no active workspace for <strong className={styles.slugEmphasis}>{attemptedSlug}</strong>.
          {domain ? (
            <>
              {' '}
              Your team&apos;s sign-in page usually looks like{' '}
              <strong className={styles.slugEmphasis}>your-company.{domain}</strong> — compare with the link your
              admin shared.
            </>
          ) : (
            <> Double-check the first part of the address in your browser.</>
          )}
        </p>

        <div className={styles.lookupPanel}>
          <h2 className={styles.subtitle}>Find your sign-in page</h2>
          <p className={styles.hint}>
            Enter the same email you use for this product. We only list workspaces where that email is already a team
            account.
          </p>
          <form onSubmit={onSubmit} className={styles.form} noValidate>
            {apiError ? (
              <Alert variant="error" className={styles.alert} display="inline">
                {apiError}
              </Alert>
            ) : null}
            <Input
              type="email"
              name="email"
              autoComplete="email"
              label="Work email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={fieldError}
              placeholder="you@company.com"
              disabled={loading}
              inputClassName={authUi.authInput}
            />
            <Button
              type="submit"
              variant="primary"
              fullWidth
              loading={loading}
              className={`${styles.submit} ${authUi.authSubmit}`}
            >
              Look up workspace
            </Button>
          </form>

          {result ? (
            <div className={styles.results}>
              {!result.found ? (
                <div className={styles.resultCalloutWarn}>
                  <MaterialSymbol name="search_off" className={styles.calloutIcon} />
                  <div>
                    <p className={styles.calloutTitle}>No workspace matched</p>
                    <p className={styles.calloutText}>
                      Try another email, ask your admin for the correct link, or confirm you were invited to an
                      organization on this site.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {result.isPlatformAdmin ? (
                    <div className={styles.resultCalloutInfo}>
                      <MaterialSymbol name="admin_panel_settings" className={styles.calloutIcon} />
                      <div className={styles.resultCalloutBody}>
                        <p className={styles.calloutTitle}>Platform administrator</p>
                        <p className={styles.calloutText}>
                          This email is for the admin console, not a company workspace. Sign in here:
                        </p>
                        <CopyUrlRow url={platformLoginUrl} />
                      </div>
                    </div>
                  ) : null}
                  {result.workspaces?.length ? (
                    <div className={styles.resultCalloutSuccess}>
                      <MaterialSymbol name="check_circle" className={styles.calloutIcon} />
                      <div className={styles.resultCalloutBody}>
                        <p className={styles.calloutTitle}>Your sign-in links</p>
                        <p className={styles.calloutText}>
                          Open one of these in a new tab (or copy the link), then sign in with your email and password.
                        </p>
                        <ul className={styles.workspaceResultList}>
                          {result.workspaces.map((w) => {
                            const url = `${getTenantWorkspaceUrl(w.slug)}/login`;
                            return (
                              <li key={w.slug} className={styles.workspaceResultItem}>
                                <span className={styles.workspaceOrgName}>{w.tenantName || w.slug}</span>
                                <CopyUrlRow url={url} />
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </div>

        {mainSiteUrl ? (
          <p className={styles.footer}>
            <a href={mainSiteUrl} rel="noreferrer">
              Back to main site
            </a>
          </p>
        ) : null}
        </div>
      </div>
    </div>
  );
}
