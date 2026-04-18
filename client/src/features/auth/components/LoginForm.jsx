import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../app/hooks';
import { selectAuthLoading, selectAuthError } from '../authSelectors';
import { loginStart, loginSuccess, loginFailure } from '../authSlice';
import { login as loginAPI } from '../authAPI';
import { userAndTenantFromToken } from '../utils/jwtUtils';
import { getTenantWorkspaceHost, getTenantWorkspaceUrl } from '../../../config/tenantWorkspaceUrl';
import { copyToClipboard } from '../../../utils/copyToClipboard';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Alert } from '../../../components/ui/Alert';
import { PasswordField } from './PasswordField';
import authUi from './authFormShared.module.scss';
import styles from './LoginForm.module.scss';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(email, password) {
  const errors = {};
  if (!email.trim()) errors.email = 'Email is required';
  else if (!EMAIL_REGEX.test(email)) errors.email = 'Enter a valid email';
  if (!password) errors.password = 'Password is required';
  return errors;
}

export function LoginForm() {
  const dispatch = useAppDispatch();
  const [searchParams] = useSearchParams();
  const registered = searchParams.get('registered') === '1';
  const workspaceSlugRaw = searchParams.get('workspace');
  const workspaceSlug =
    workspaceSlugRaw && workspaceSlugRaw.trim() ? workspaceSlugRaw.trim().toLowerCase() : '';
  const workspaceHost = workspaceSlug ? getTenantWorkspaceHost(workspaceSlug) : '';
  const workspaceUrl = workspaceSlug ? getTenantWorkspaceUrl(workspaceSlug) : '';
  const loading = useAppSelector(selectAuthLoading);
  const error = useAppSelector(selectAuthError);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [sessionMessage, setSessionMessage] = useState(null);
  const [workspaceCopied, setWorkspaceCopied] = useState(false);

  const copyWorkspaceUrl = useCallback(async () => {
    if (!workspaceUrl) return;
    const ok = await copyToClipboard(workspaceUrl);
    if (ok) {
      setWorkspaceCopied(true);
      window.setTimeout(() => setWorkspaceCopied(false), 2000);
    }
  }, [workspaceUrl]);

  // Check for session expired message (e.g., token version mismatch)
  useEffect(() => {
    const message = sessionStorage.getItem('auth_message');
    if (message) {
      setSessionMessage(message);
      sessionStorage.removeItem('auth_message');
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validate(email, password);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSessionMessage(null);
    dispatch(loginStart());
    try {
      const data = await loginAPI(email, password);
      const { user, tenant, permissions, tokenVersion } = userAndTenantFromToken(data.access_token);
      dispatch(
        loginSuccess({
          user,
          tenant,
          accessToken: data.access_token,
          refreshToken: data.refresh_token ?? null,
          permissions,
          tokenVersion,
        })
      );
    } catch (err) {
      const apiMsg = err.response?.data?.error;
      const transient =
        err.code === 'ECONNRESET' ||
        err.code === 'ECONNREFUSED' ||
        err.code === 'ETIMEDOUT' ||
        err.message === 'Network Error';
      const message =
        apiMsg ??
        (transient
          ? 'Could not reach the server. Check your connection and try again.'
          : null) ??
        err.message ??
        'Login failed';
      dispatch(loginFailure(message));
    }
  };

  return (
    <div className={authUi.shell}>
      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        <h1 className={styles.title}>Sign in</h1>
        <p className={styles.lead}>Use your workspace email and password.</p>
        {sessionMessage && (
          <Alert variant="warning" className={styles.alert}>
            {sessionMessage}
          </Alert>
        )}
        {registered && workspaceHost && (
          <div className={styles.workspaceBanner}>
            <p className={styles.workspaceBannerTitle}>Your workspace is ready</p>
            <p className={styles.workspaceBannerText}>
              Sign in only from your company’s address — bookmarks or opens from this link. The main site or admin
              URLs won&apos;t work for your team login.
            </p>
            <div className={styles.workspaceBannerRow}>
              <code className={styles.workspaceHost}>{workspaceHost}</code>
              <Button type="button" variant="secondary" className={styles.workspaceCopyBtn} onClick={copyWorkspaceUrl}>
                {workspaceCopied ? 'Copied' : 'Copy link'}
              </Button>
            </div>
            <p className={styles.workspaceBannerHint}>
              Bookmark the copied link, open it in a new tab, and sign in there with the email and password you just
              created.
            </p>
          </div>
        )}
        {registered && !workspaceHost && (
          <Alert variant="success" className={styles.alert}>
            Account created. Please sign in from your workspace URL (your administrator can share it), then use your
            email and password.
          </Alert>
        )}
        {error && (
          <Alert variant="error" className={styles.alert}>
            {error}
          </Alert>
        )}
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          disabled={loading}
          placeholder="you@company.com"
          inputClassName={authUi.authInput}
        />
        <PasswordField
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          disabled={loading}
          placeholder="••••••••"
          inputClassName={authUi.authInput}
        />
        <Button type="submit" fullWidth loading={loading} className={`${styles.submit} ${authUi.authSubmit}`}>
          Sign in
        </Button>
        <p className={styles.footer}>
          Don&apos;t have an account?{' '}
          <Link to="/register">Register your company</Link>
        </p>
      </form>
    </div>
  );
}
