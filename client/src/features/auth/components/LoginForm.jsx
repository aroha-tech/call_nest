import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../app/hooks';
import { selectAuthLoading, selectAuthError } from '../authSelectors';
import { loginStart, loginSuccess, loginFailure } from '../authSlice';
import { login as loginAPI } from '../authAPI';
import { userAndTenantFromToken } from '../utils/jwtUtils';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Card } from '../../../components/ui/Card';
import { Alert } from '../../../components/ui/Alert';
import { PasswordField } from './PasswordField';
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
  const loading = useAppSelector(selectAuthLoading);
  const error = useAppSelector(selectAuthError);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [sessionMessage, setSessionMessage] = useState(null);

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
    <Card className={styles.card}>
      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        <h1 className={styles.title}>Sign in</h1>
        {sessionMessage && (
          <Alert variant="warning" className={styles.alert}>
            {sessionMessage}
          </Alert>
        )}
        {registered && (
          <Alert variant="success" className={styles.alert}>
            Account created. Please sign in.
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
        />
        <PasswordField
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          disabled={loading}
          placeholder="••••••••"
        />
        <Button type="submit" fullWidth loading={loading} className={styles.submit}>
          Sign in
        </Button>
        <p className={styles.footer}>
          Don&apos;t have an account?{' '}
          <Link to="/register">Register your company</Link>
        </p>
      </form>
    </Card>
  );
}
