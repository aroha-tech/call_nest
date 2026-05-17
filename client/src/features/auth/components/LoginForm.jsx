import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../app/hooks';
import { selectAuthLoading, selectAuthError } from '../authSelectors';
import { loginStart, loginSuccess, loginFailure, loginCancelled } from '../authSlice';
import { broadcastAuthEvent } from '../../../services/authSync';
import { login as loginAPI } from '../authAPI';
import { userAndTenantFromToken } from '../utils/jwtUtils';
import { getTenantWorkspaceHost, getTenantWorkspaceUrl } from '../../../config/tenantWorkspaceUrl';
import { copyToClipboard } from '../../../utils/copyToClipboard';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Alert } from '../../../components/ui/Alert';
import { MaterialSymbol } from '../../../components/ui/MaterialSymbol';
import { PasswordField } from './PasswordField';
import { LoginSessionConflictModal } from './LoginSessionConflictModal';
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
  const [sessionConflictOpen, setSessionConflictOpen] = useState(false);
  const [takeOverLoading, setTakeOverLoading] = useState(false);

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

  const completeLogin = useCallback(
    async (takeOver = false) => {
      dispatch(loginStart());
      try {
        const data = await loginAPI(email, password, { takeOver });
        const { user, tenant, permissions, tokenVersion } = userAndTenantFromToken(data.access_token);
        setSessionConflictOpen(false);
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
        if (takeOver) {
          broadcastAuthEvent('session-superseded');
        }
      } catch (err) {
        const code = err.response?.data?.code;
        if (code === 'SESSION_ACTIVE' && !takeOver) {
          dispatch(loginCancelled());
          setSessionConflictOpen(true);
          return;
        }
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
      } finally {
        setTakeOverLoading(false);
      }
    },
    [dispatch, email, password]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validate(email, password);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSessionMessage(null);
    setSessionConflictOpen(false);
    await completeLogin(false);
  };

  const handleStayOnLoginPage = () => {
    setSessionConflictOpen(false);
    dispatch(loginCancelled());
  };

  const handleTakeOverSession = async () => {
    setTakeOverLoading(true);
    await completeLogin(true);
  };

  return (
    <div className={authUi.shell}>
      <LoginSessionConflictModal
        isOpen={sessionConflictOpen}
        onStay={handleStayOnLoginPage}
        onTakeOver={handleTakeOverSession}
        loading={takeOverLoading}
      />
      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        <div className={styles.headerIcon}>
          <MaterialSymbol name="lock" size="md" />
        </div>
        <h1 className={styles.title}>Welcome back</h1>
        <p className={styles.lead}>Sign in to your account</p>
        {sessionMessage && (
          <Alert variant="warning" className={styles.alert} display="inline">
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
          <Alert variant="success" className={styles.alert} display="inline">
            Account created. Please sign in from your workspace URL (your administrator can share it), then use your
            email and password.
          </Alert>
        )}
        {error && (
          <Alert variant="error" className={styles.alert} display="inline">
            {error}
          </Alert>
        )}
        <Input
          label="Email address"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          disabled={loading || takeOverLoading}
          placeholder="Enter your email"
          inputClassName={authUi.authInput}
          suffix={<MaterialSymbol name="mail" size="sm" />}
        />
        <PasswordField
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          disabled={loading || takeOverLoading}
          placeholder="Enter your password"
          inputClassName={authUi.authInput}
        />
        
        <div className={styles.optionsRow}>
          <label className={styles.rememberMe}>
            <input type="checkbox" />
            Remember me
          </label>
          <Link to="#" className={styles.forgotPassword}>Forgot password?</Link>
        </div>

        <Button type="submit" fullWidth loading={loading || takeOverLoading} className={`${styles.submit} ${authUi.authSubmit}`}>
          Sign in
        </Button>
        
        <div className={styles.divider}>
          <span>or continue with</span>
        </div>
        
        <div className={styles.oauthGrid}>
          <button type="button" className={styles.oauthBtn}>
            <svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google
          </button>
          <button type="button" className={styles.oauthBtn}>
            <svg viewBox="0 0 21 21" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
              <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
              <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
            </svg>
            Microsoft
          </button>
          <button type="button" className={styles.oauthBtn}>
            <svg viewBox="0 0 384 512" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
              <path fill="#ffffff" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.3 48.6-.7 90.4-84.3 102.8-119.5-65.2-30.7-61.7-90-61.9-91.1zm-53.6-165.1c17.5-21.4 28.1-50.5 24.9-79.5-24.6 1.4-53.7 17.2-71.9 38.6-15.6 18.2-28 47.4-24 76 26.5 2 53.6-13.7 71-35.1z"/>
            </svg>
            Apple
          </button>
        </div>

        <p className={styles.footer}>
          Don&apos;t have an account?{' '}
          <Link to="/register">Sign up</Link>
        </p>
      </form>
    </div>
  );
}
