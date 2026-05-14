import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../app/hooks';
import { selectAuthLoading, selectAuthError } from '../authSelectors';
import { registerStart, registerSuccess, registerFailure, clearError } from '../authSlice';
import {
  registerTenant as registerTenantAPI,
  getIndustries,
  getTenantSlugStatus,
} from '../authAPI';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Alert } from '../../../components/ui/Alert';
import { MaterialSymbol } from '../../../components/ui/MaterialSymbol';
import { PasswordField } from './PasswordField';
import authUi from './authFormShared.module.scss';
import {
  slugFromCompanyName,
  validateSlug,
  describeTenantSlugSourceIssue,
} from '../utils/slugUtils';
import { getPasswordStrength } from '../utils/passwordStrength';
import styles from './RegisterTenantForm.module.scss';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateFields(values) {
  const errors = {};
  if (!values.tenantName?.trim()) errors.tenantName = 'Company name is required';
  if (!values.industryId) errors.industryId = 'Industry is required';
  if (!values.name?.trim()) errors.name = 'Admin name is required';
  if (!values.email?.trim()) errors.email = 'Email is required';
  else if (!EMAIL_REGEX.test(values.email)) errors.email = 'Enter a valid email';
  if (!values.password) errors.password = 'Password is required';
  else if (values.password.length < 8) errors.password = 'At least 8 characters required';
  if (values.password !== values.confirmPassword) errors.confirmPassword = 'Passwords do not match';
  return errors;
}

const SLUG_DEBOUNCE_MS = 400;

export function RegisterTenantForm() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const loading = useAppSelector(selectAuthLoading);
  const error = useAppSelector(selectAuthError);

  const [industries, setIndustries] = useState([]);
  const [industriesLoading, setIndustriesLoading] = useState(true);

  const [tenantName, setTenantName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [slugRawInput, setSlugRawInput] = useState('');
  const [industryId, setIndustryId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [slugTouched, setSlugTouched] = useState(false);

  /** Drop server/submit errors for fields the user is correcting. */
  const clearFieldError = useCallback((...keys) => {
    setFieldErrors((prev) => {
      let next = prev;
      let changed = false;
      for (const key of keys) {
        if (next[key]) {
          if (!changed) {
            next = { ...prev };
            changed = true;
          }
          delete next[key];
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const [slugSourceError, setSlugSourceError] = useState(null);
  const [slugRemote, setSlugRemote] = useState({
    loading: false,
    available: null,
    message: null,
    suggestions: [],
  });

  const slugReqId = useRef(0);

  useEffect(() => {
    async function loadIndustries() {
      try {
        const data = await getIndustries();
        setIndustries(data);
      } catch (err) {
        console.error('Failed to load industries:', err);
      } finally {
        setIndustriesLoading(false);
      }
    }
    loadIndustries();
  }, []);

  useEffect(() => {
    const localErr = validateSlug(tenantSlug);
    if (localErr || slugSourceError) {
      setSlugRemote({ loading: false, available: null, message: null, suggestions: [] });
      return;
    }
    const trimmed = tenantSlug.trim();
    if (!trimmed) {
      setSlugRemote({ loading: false, available: null, message: null, suggestions: [] });
      return;
    }

    const reqId = ++slugReqId.current;
    setSlugRemote((s) => ({ ...s, loading: true }));

    const t = setTimeout(async () => {
      try {
        const data = await getTenantSlugStatus(trimmed);
        if (slugReqId.current !== reqId) return;
        if (!data.valid) {
          setSlugRemote({
            loading: false,
            available: false,
            message: data.error,
            suggestions: data.suggestions || [],
          });
          return;
        }
        if (!data.available) {
          setSlugRemote({
            loading: false,
            available: false,
            message: data.error,
            suggestions: data.suggestions || [],
          });
          return;
        }
        setSlugRemote({ loading: false, available: true, message: null, suggestions: [] });
      } catch {
        if (slugReqId.current !== reqId) return;
        setSlugRemote({ loading: false, available: null, message: null, suggestions: [] });
      }
    }, SLUG_DEBOUNCE_MS);

    return () => clearTimeout(t);
  }, [tenantSlug, slugSourceError]);

  const industryOptions = industries.map((i) => ({ value: i.id, label: i.name }));

  const handleCompanyChange = useCallback(
    (e) => {
      const value = e.target.value;
      setTenantName(value);
      clearFieldError('tenantName', 'tenantSlug');
      dispatch(clearError());
      if (!slugTouched) {
        const nextSlug = slugFromCompanyName(value);
        setTenantSlug(nextSlug);
        setSlugRawInput(nextSlug);
        setSlugSourceError(
          describeTenantSlugSourceIssue(value) || describeTenantSlugSourceIssue(nextSlug)
        );
      }
    },
    [slugTouched, clearFieldError, dispatch]
  );

  const handleSlugChange = (e) => {
    setSlugTouched(true);
    clearFieldError('tenantSlug');
    dispatch(clearError());
    const raw = e.target.value;
    setSlugRawInput(raw);
    setSlugSourceError(describeTenantSlugSourceIssue(raw));
    setTenantSlug(slugFromCompanyName(raw));
  };

  const applySuggestedSlug = (s) => {
    setSlugTouched(true);
    setTenantSlug(s);
    setSlugRawInput(s);
    setSlugSourceError(null);
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.tenantSlug;
      return next;
    });
  };

  const slugFormatError = validateSlug(tenantSlug);

  const slugHintParts = [];
  if (!slugFormatError && !slugSourceError && slugRemote.loading) {
    slugHintParts.push('Checking availability…');
  }
  if (slugRemote.available === true) {
    slugHintParts.push('This address is available.');
  }

  const slugFieldError =
    fieldErrors.tenantSlug ||
    (slugTouched && (slugSourceError || slugFormatError)) ||
    (slugTouched && slugRemote.available === false && (slugRemote.message || null)) ||
    null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const values = {
      tenantName,
      tenantSlug,
      industryId,
      name,
      email,
      password,
      confirmPassword,
    };
    const errors = validateFields(values);
    const srcErr = describeTenantSlugSourceIssue(slugRawInput || tenantSlug);
    const fmtErr = validateSlug(tenantSlug);
    if (srcErr) errors.tenantSlug = srcErr;
    else if (fmtErr) errors.tenantSlug = fmtErr;
    else if (slugRemote.loading) errors.tenantSlug = 'Please wait while we check availability.';
    else if (slugRemote.available === false) {
      errors.tenantSlug = slugRemote.message || 'This address is not available.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    dispatch(registerStart());
    try {
      const data = await registerTenantAPI({
        tenantName: tenantName.trim(),
        tenantSlug: tenantSlug.trim(),
        industryId,
        email: email.trim(),
        password,
        name: name.trim(),
      });
      dispatch(registerSuccess());
      const registeredSlug = data?.tenant?.slug ?? tenantSlug.trim();
      navigate(`/login?registered=1&workspace=${encodeURIComponent(registeredSlug)}`);
    } catch (err) {
      const message = err.response?.data?.error ?? err.message ?? 'Registration failed';
      dispatch(registerFailure(message));
      if (err.response?.status === 409 || /slug|address|workspace/i.test(message)) {
        setFieldErrors((prev) => ({ ...prev, tenantSlug: message }));
      }
    }
  };

  const strength = getPasswordStrength(password);

  const showSuggestions =
    Array.isArray(slugRemote.suggestions) && slugRemote.suggestions.length > 0 && !slugRemote.loading;

  return (
    <div className={authUi.shell}>
      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        <div className={styles.headerGroup}>
          <h1 className={styles.title}>Create your account</h1>
          <p className={styles.subtitle}>
            Get started with CallXTime
          </p>
        </div>

        {error && (
          <Alert variant="error" className={styles.alert} display="inline">
            {error}
          </Alert>
        )}

        <div className={styles.section}>
          <p className={styles.sectionTitle}>Company Details</p>
          <div className={styles.fieldGrid}>
            <Input
              label="Company Name"
              value={tenantName}
              onChange={handleCompanyChange}
              error={fieldErrors.tenantName}
              disabled={loading}
              placeholder="Enter company name"
              autoComplete="organization"
              inputClassName={authUi.authInput}
              suffix={<MaterialSymbol name="domain" size="sm" />}
            />
            <Select
              label="Industry"
              value={industryId}
              onChange={(e) => {
                setIndustryId(e.target.value);
                clearFieldError('industryId');
                dispatch(clearError());
              }}
              options={industryOptions}
              error={fieldErrors.industryId}
              disabled={loading || industriesLoading}
              placeholder={industriesLoading ? 'Loading...' : 'Select industry'}
              selectClassName={authUi.authSelect}
            />
          </div>
          <div className={styles.slugBlock}>
            <Input
              label="Workspace address (slug)"
              value={slugRawInput || tenantSlug}
              onChange={handleSlugChange}
              onBlur={() => setSlugTouched(true)}
              error={slugFieldError}
              hint={
                slugHintParts.length > 0
                  ? slugHintParts.join(' ')
                  : 'Lowercase letters & hyphens only — used in your sign-in URL (e.g. acme-corp).'
              }
              disabled={loading}
              placeholder="your-workspace"
              autoComplete="off"
              inputClassName={authUi.authInput}
              prefix={<span style={{ color: 'rgba(255,255,255,0.4)', paddingRight: '4px' }}>callxtime.com/</span>}
              suffix={slugRemote.available ? <MaterialSymbol name="check_circle" size="sm" /> : null}
            />
            {showSuggestions && (
              <div className={styles.suggestions}>
                <span className={styles.suggestionsLabel}>Available ideas:</span>
                <div className={styles.suggestionChips}>
                  {slugRemote.suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={styles.suggestionChip}
                      onClick={() => applySuggestedSlug(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={styles.section}>
          <p className={styles.sectionTitle}>Admin Account</p>
          <div className={styles.fieldGrid}>
            <Input
              label="Admin Name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clearFieldError('name');
                dispatch(clearError());
              }}
              error={fieldErrors.name}
              disabled={loading}
              placeholder="Enter your full name"
              autoComplete="name"
              inputClassName={authUi.authInput}
              suffix={<MaterialSymbol name="person" size="sm" />}
            />
            <Input
              label="Work Email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearFieldError('email');
                dispatch(clearError());
              }}
              error={fieldErrors.email}
              disabled={loading}
              placeholder="Enter your work email"
              autoComplete="email"
              inputClassName={authUi.authInput}
              suffix={<MaterialSymbol name="mail" size="sm" />}
            />
          </div>
          <div className={styles.passwordBlock}>
            <PasswordField
              label="Password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearFieldError('password', 'confirmPassword');
                dispatch(clearError());
              }}
              error={fieldErrors.password}
              disabled={loading}
              placeholder="••••••••"
              autoComplete="new-password"
              inputClassName={authUi.authInput}
            />
            {password.length > 0 && (
              <div className={styles.strength} aria-live="polite">
                <span className={styles.strengthLabel}>Strength: </span>
                <span className={styles[strength.level]}>{strength.label}</span>
              </div>
            )}
          </div>
          <PasswordField
            label="Confirm password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              clearFieldError('confirmPassword');
              dispatch(clearError());
            }}
            error={fieldErrors.confirmPassword}
            disabled={loading}
            placeholder="Confirm your password"
            autoComplete="new-password"
            inputClassName={authUi.authInput}
          />
        </div>

        <label className={styles.terms}>
          <input type="checkbox" defaultChecked />
          <span>
            I agree to the <Link to="#">Terms of Service</Link> and <Link to="#">Privacy Policy</Link>
          </span>
        </label>

        <Button type="submit" fullWidth loading={loading} className={`${styles.submit} ${authUi.authSubmit}`}>
          Create account
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
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
