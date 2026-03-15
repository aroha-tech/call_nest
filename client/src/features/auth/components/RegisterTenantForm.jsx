import React, { useState, useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../app/hooks';
import { selectAuthLoading, selectAuthError } from '../authSelectors';
import { registerStart, registerSuccess, registerFailure } from '../authSlice';
import { registerTenant as registerTenantAPI, getIndustries } from '../authAPI';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Card } from '../../../components/ui/Card';
import { Alert } from '../../../components/ui/Alert';
import { PasswordField } from './PasswordField';
import { slugFromCompanyName, validateSlug } from '../utils/slugUtils';
import { getPasswordStrength } from '../utils/passwordStrength';
import styles from './RegisterTenantForm.module.scss';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_REGEX = /^[a-z0-9-]+$/;

function validateFields(values) {
  const errors = {};
  if (!values.tenantName?.trim()) errors.tenantName = 'Company name is required';
  if (!values.tenantSlug?.trim()) errors.tenantSlug = 'Slug is required';
  else if (!SLUG_REGEX.test(values.tenantSlug)) errors.tenantSlug = 'Only lowercase letters, numbers, and hyphens';
  if (!values.industryId) errors.industryId = 'Industry is required';
  if (!values.name?.trim()) errors.name = 'Admin name is required';
  if (!values.email?.trim()) errors.email = 'Email is required';
  else if (!EMAIL_REGEX.test(values.email)) errors.email = 'Enter a valid email';
  if (!values.password) errors.password = 'Password is required';
  else if (values.password.length < 8) errors.password = 'At least 8 characters required';
  if (values.password !== values.confirmPassword) errors.confirmPassword = 'Passwords do not match';
  return errors;
}

export function RegisterTenantForm() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const loading = useAppSelector(selectAuthLoading);
  const error = useAppSelector(selectAuthError);
  
  const [industries, setIndustries] = useState([]);
  const [industriesLoading, setIndustriesLoading] = useState(true);
  
  const [tenantName, setTenantName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [industryId, setIndustryId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [slugTouched, setSlugTouched] = useState(false);

  // Load industries on mount
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

  const industryOptions = industries.map(i => ({ value: i.id, label: i.name }));

  const handleCompanyChange = useCallback((e) => {
    const value = e.target.value;
    setTenantName(value);
    if (!slugTouched) setTenantSlug(slugFromCompanyName(value));
  }, [slugTouched]);

  const handleSlugChange = (e) => {
    setSlugTouched(true);
    setTenantSlug(slugFromCompanyName(e.target.value));
  };

  const slugError = validateSlug(tenantSlug);

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
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    if (slugError) {
      setFieldErrors((prev) => ({ ...prev, tenantSlug: slugError }));
      return;
    }
    setFieldErrors({});
    dispatch(registerStart());
    try {
      await registerTenantAPI({
        tenantName: tenantName.trim(),
        tenantSlug: tenantSlug.trim(),
        industryId,
        email: email.trim(),
        password,
        name: name.trim(),
      });
      dispatch(registerSuccess());
      navigate('/login?registered=1');
    } catch (err) {
      const message = err.response?.data?.error ?? err.message ?? 'Registration failed';
      dispatch(registerFailure(message));
    }
  };

  const strength = getPasswordStrength(password);

  return (
    <Card className={styles.card}>
      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        <h1 className={styles.title}>Register your company</h1>
        <p className={styles.subtitle}>Get started with Call Nest CRM</p>
        
        {error && (
          <Alert variant="error" className={styles.alert}>
            {error}
          </Alert>
        )}
        
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Company Details</p>
          <Input
            label="Company Name"
            value={tenantName}
            onChange={handleCompanyChange}
            error={fieldErrors.tenantName}
            disabled={loading}
            placeholder="Acme Inc"
            autoComplete="organization"
          />
          <Input
            label="Slug"
            value={tenantSlug}
            onChange={handleSlugChange}
            onBlur={() => setSlugTouched(true)}
            error={fieldErrors.tenantSlug || (slugTouched && slugError)}
            hint="Lowercase, numbers, hyphens only (e.g. acme-inc)"
            disabled={loading}
            placeholder="acme-inc"
            autoComplete="off"
          />
          <Select
            label="Industry"
            value={industryId}
            onChange={(e) => setIndustryId(e.target.value)}
            options={industryOptions}
            error={fieldErrors.industryId}
            disabled={loading || industriesLoading}
            placeholder={industriesLoading ? 'Loading...' : 'Select your industry'}
          />
        </div>
        
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Admin Account</p>
          <Input
            label="Admin Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={fieldErrors.name}
            disabled={loading}
            placeholder="Jane Doe"
            autoComplete="name"
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors.email}
            disabled={loading}
            placeholder="admin@acme.com"
            autoComplete="email"
          />
          <div className={styles.passwordBlock}>
            <PasswordField
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={fieldErrors.password}
              disabled={loading}
              placeholder="••••••••"
              autoComplete="new-password"
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
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={fieldErrors.confirmPassword}
            disabled={loading}
            placeholder="••••••••"
            autoComplete="new-password"
          />
        </div>
        
        <Button type="submit" fullWidth loading={loading} className={styles.submit}>
          Create account
        </Button>
        <p className={styles.footer}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </Card>
  );
}
