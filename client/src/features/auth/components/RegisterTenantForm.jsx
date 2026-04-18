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
        <h1 className={styles.title}>Register your company</h1>
        <p className={styles.subtitle}>
          One workspace URL for your company, tenant-isolated data, and an admin account to invite your team.
        </p>

        {error && (
          <Alert variant="error" className={styles.alert}>
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
              placeholder="Acme Inc"
              autoComplete="organization"
              inputClassName={authUi.authInput}
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
              placeholder="acme-corp"
              autoComplete="off"
              inputClassName={authUi.authInput}
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
              placeholder="Jane Doe"
              autoComplete="name"
              inputClassName={authUi.authInput}
            />
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearFieldError('email');
                dispatch(clearError());
              }}
              error={fieldErrors.email}
              disabled={loading}
              placeholder="admin@acme.com"
              autoComplete="email"
              inputClassName={authUi.authInput}
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
            label="Confirm Password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              clearFieldError('confirmPassword');
              dispatch(clearError());
            }}
            error={fieldErrors.confirmPassword}
            disabled={loading}
            placeholder="••••••••"
            autoComplete="new-password"
            inputClassName={authUi.authInput}
          />
        </div>

        <Button type="submit" fullWidth loading={loading} className={`${styles.submit} ${authUi.authSubmit}`}>
          Create account
        </Button>
        <p className={styles.footer}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
