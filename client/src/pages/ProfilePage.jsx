import React, { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { selectUser, selectTenant, selectRefreshToken } from '../features/auth/authSelectors';
import { setTokens } from '../features/auth/authSlice';
import { userAndTenantFromToken } from '../features/auth/utils/jwtUtils';
import { getUserDisplayName, getUserInitials } from '../features/auth/utils/userDisplay';
import { updateProfile as updateProfileAPI } from '../features/auth/authAPI';
import { PageHeader } from '../components/ui/PageHeader';
import { Input } from '../components/ui/Input';
import { PasswordField } from '../features/auth/components/PasswordField';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import styles from './ProfilePage.module.scss';

const ROLE_LABELS = {
  super_admin: 'Platform Admin',
  admin: 'Admin',
  manager: 'Manager',
  agent: 'Agent',
};

function roleLabel(role, isPlatformAdmin) {
  if (isPlatformAdmin) return 'Platform Admin';
  if (!role) return '—';
  return ROLE_LABELS[role] ?? role;
}

function clearPasswordFields(setters) {
  setters.setCurrentPassword('');
  setters.setNewPassword('');
  setters.setConfirmPassword('');
}

/**
 * Profile: editable name; password change behind an explicit action.
 */
export function ProfilePage() {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const tenant = useAppSelector(selectTenant);
  const refreshToken = useAppSelector(selectRefreshToken);

  const [name, setName] = useState('');
  const [passwordFlowOpen, setPasswordFlowOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [apiError, setApiError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setName(user.name ?? '');
    setFieldErrors({});
    setApiError(null);
  }, [user?.id, user?.name]);

  useEffect(() => {
    if (!user) return;
    clearPasswordFields({ setCurrentPassword, setNewPassword, setConfirmPassword });
    setPasswordFlowOpen(false);
  }, [user?.id]);

  if (!user) return null;

  const previewUser = { ...user, name: name.trim() || null };
  const displayName = getUserDisplayName(previewUser);
  const initials = getUserInitials(previewUser);
  const photo = user.profilePhotoUrl;

  const passwordFieldsTouched =
    currentPassword.trim() !== '' || newPassword.trim() !== '' || confirmPassword.trim() !== '';

  const attemptingPasswordChange = passwordFlowOpen && passwordFieldsTouched;

  function validate() {
    const errors = {};
    if (name.length > 255) {
      errors.name = 'Name must be at most 255 characters';
    }
    if (attemptingPasswordChange) {
      if (!currentPassword.trim()) {
        errors.currentPassword = 'Enter your current password';
      }
      if (!newPassword.trim()) {
        errors.newPassword = 'Enter a new password';
      } else if (newPassword.length < 8) {
        errors.newPassword = 'Password must be at least 8 characters';
      }
      if (newPassword !== confirmPassword) {
        errors.confirmPassword = 'Does not match new password';
      }
    }
    return errors;
  }

  function closePasswordFlow() {
    setPasswordFlowOpen(false);
    clearPasswordFields({ setCurrentPassword, setNewPassword, setConfirmPassword });
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.currentPassword;
      delete next.newPassword;
      delete next.confirmPassword;
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setApiError(null);
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const payload = { name: name.trim() || null };
      if (attemptingPasswordChange && newPassword.trim()) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }
      const data = await updateProfileAPI(payload);
      const token = data?.access_token;
      if (!token) {
        setApiError('Unexpected response from server');
        return;
      }
      const { user: nextUser, tenant: nextTenant, permissions, tokenVersion } =
        userAndTenantFromToken(token);
      dispatch(
        setTokens({
          accessToken: token,
          refreshToken: refreshToken ?? undefined,
          permissions,
          tokenVersion,
          user: nextUser,
          tenant: nextTenant,
        })
      );
      closePasswordFlow();
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.error ?? err.message ?? 'Could not save profile';
      setApiError(msg);
      if (
        status === 400 &&
        typeof msg === 'string' &&
        msg.toLowerCase().includes('current password')
      ) {
        setFieldErrors((prev) => ({ ...prev, currentPassword: 'Incorrect current password' }));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Profile"
        description="Update your name. Use Change password when you want to set a new password. Email changes will be available later with verification."
      />
      <form className={styles.card} onSubmit={handleSubmit} noValidate>
        <div className={styles.hero}>
          <div className={styles.avatarLarge} aria-hidden={photo ? undefined : true}>
            {photo ? (
              <img src={photo} alt="" className={styles.avatarImg} />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <div className={styles.heroText}>
            <h2 className={styles.displayName}>{displayName}</h2>
            <div className={styles.emailBlock}>
              <span className={styles.emailLabel}>Email</span>
              <p className={styles.emailValue} title={user.email}>
                {user.email}
              </p>
              <p className={styles.emailHint}>Email cannot be changed here yet.</p>
            </div>
          </div>
        </div>

        {apiError && (
          <Alert variant="error" className={styles.alert}>
            {apiError}
          </Alert>
        )}

        <div className={styles.form}>
          <Input
            id="profile-name"
            label="Full name"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={fieldErrors.name}
            placeholder="Your name"
          />

          {!passwordFlowOpen && (
            <div className={styles.changePwdTrigger}>
              <Button type="button" variant="secondary" onClick={() => setPasswordFlowOpen(true)}>
                Change password
              </Button>
            </div>
          )}

          {passwordFlowOpen && (
            <div className={styles.passwordSection}>
              <div className={styles.passwordSectionHeader}>
                <h3 className={styles.sectionTitle}>Change password</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setApiError(null);
                    closePasswordFlow();
                  }}
                >
                  Cancel
                </Button>
              </div>
              <p className={styles.sectionHint}>
                Enter your current password and choose a new one (at least 8 characters).
              </p>
              <PasswordField
                id="profile-current-password"
                label="Current password"
                name="currentPassword"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                error={fieldErrors.currentPassword}
              />
              <PasswordField
                id="profile-new-password"
                label="New password"
                name="newPassword"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                error={fieldErrors.newPassword}
              />
              <PasswordField
                id="profile-confirm-password"
                label="Confirm new password"
                name="confirmPassword"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={fieldErrors.confirmPassword}
              />
            </div>
          )}
        </div>

        <div className={styles.actions}>
          <Button type="submit" variant="primary" loading={saving} disabled={saving}>
            Save changes
          </Button>
        </div>

        <dl className={styles.details}>
          <div className={styles.detailRow}>
            <dt>Role</dt>
            <dd>{roleLabel(user.role, user.isPlatformAdmin)}</dd>
          </div>
          {tenant?.id != null && (
            <div className={styles.detailRow}>
              <dt>Workspace</dt>
              <dd>ID {tenant.id}</dd>
            </div>
          )}
        </dl>
      </form>
    </div>
  );
}
