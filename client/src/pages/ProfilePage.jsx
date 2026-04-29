import React, { useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { selectUser, selectTenant, selectRefreshToken } from '../features/auth/authSelectors';
import { setTokens } from '../features/auth/authSlice';
import { userAndTenantFromToken } from '../features/auth/utils/jwtUtils';
import { getUserDisplayName, getUserInitials, getManagerDisplayLabel } from '../features/auth/utils/userDisplay';
import { updateProfile as updateProfileAPI } from '../features/auth/authAPI';
import {
  DATETIME_DISPLAY_BROWSER,
  DATETIME_DISPLAY_IST,
  COMMON_TIMEZONE_OPTIONS,
  DATE_FORMAT_OPTIONS,
  TIME_FORMAT_OPTIONS,
  DEFAULT_DATETIME_TIMEZONE,
  DEFAULT_DATE_FORMAT,
  DEFAULT_TIME_FORMAT,
} from '../utils/dateTimeDisplay';
import { PageHeader } from '../components/ui/PageHeader';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { PasswordField } from '../features/auth/components/PasswordField';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { InfoHelpIcon } from '../components/ui/InfoHelpIcon';
import { SectionIcon } from '../components/ui/SectionIcon';
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
  const [datetimeDisplayMode, setDatetimeDisplayMode] = useState(DATETIME_DISPLAY_IST);
  const [datetimeTimezone, setDatetimeTimezone] = useState(DEFAULT_DATETIME_TIMEZONE);
  const [datetimeDateFormat, setDatetimeDateFormat] = useState(DEFAULT_DATE_FORMAT);
  const [datetimeTimeFormat, setDatetimeTimeFormat] = useState(DEFAULT_TIME_FORMAT);

  useEffect(() => {
    if (!user) return;
    setName(user.name ?? '');
    setDatetimeDisplayMode(
      user.datetimeDisplayMode === DATETIME_DISPLAY_BROWSER ? DATETIME_DISPLAY_BROWSER : DATETIME_DISPLAY_IST
    );
    setDatetimeTimezone(user.datetimeTimezone || DEFAULT_DATETIME_TIMEZONE);
    setDatetimeDateFormat(user.datetimeDateFormat || DEFAULT_DATE_FORMAT);
    setDatetimeTimeFormat(user.datetimeTimeFormat || DEFAULT_TIME_FORMAT);
    setFieldErrors({});
    setApiError(null);
  }, [user?.id, user?.name, user?.datetimeDisplayMode, user?.datetimeTimezone, user?.datetimeDateFormat, user?.datetimeTimeFormat]);

  useEffect(() => {
    if (!user) return;
    clearPasswordFields({ setCurrentPassword, setNewPassword, setConfirmPassword });
    setPasswordFlowOpen(false);
  }, [user?.id]);

  if (!user) return null;

  const timezoneOptions = useMemo(() => {
    if (COMMON_TIMEZONE_OPTIONS.some((o) => o.value === datetimeTimezone)) {
      return COMMON_TIMEZONE_OPTIONS;
    }
    return [{ value: datetimeTimezone, label: datetimeTimezone }, ...COMMON_TIMEZONE_OPTIONS];
  }, [datetimeTimezone]);

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
      const payload = {
        name: name.trim() || null,
        datetimeDisplayMode,
        datetimeTimezone,
        datetimeDateFormat,
        datetimeTimeFormat,
      };
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
        titleIcon="account_circle"
        description="Name, date/time display, and password. Email change with verification is planned."
      />
      <div className={styles.layout}>
        <aside className={styles.leftColumn}>
          <section className={styles.card}>
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
                <p className={styles.roleBadge}>{roleLabel(user.role, user.isPlatformAdmin)}</p>
                <div className={styles.emailBlock}>
                  <span className={styles.emailLabel}>Email</span>
                  <p className={styles.emailValue} title={user.email}>
                    {user.email}
                  </p>
                  <InfoHelpIcon
                    title="Email change info"
                    modalTitle="Email"
                    message="Email cannot be changed here yet."
                  />
                </div>
              </div>
            </div>
          </section>

        </aside>

        <main className={styles.mainColumn}>
          <form className={styles.card} onSubmit={handleSubmit} noValidate>
            {apiError && (
              <Alert variant="error" className={styles.alert} display="inline">
                {apiError}
              </Alert>
            )}

            <div className={styles.infoCardHeader}>
              <SectionIcon icon="person" color="blue" size="sm" />
              <h3 className={styles.managerCardTitle}>Profile information</h3>
            </div>

            {user.role === 'agent' && !user.isPlatformAdmin && tenant?.id != null && (
              <div className={styles.managerCard}>
                <div className={styles.managerCardHeader}>
                  <SectionIcon icon="supervisor_account" color="cyan" size="sm" />
                  <h3 className={styles.managerCardTitle}>Your manager</h3>
                </div>
                {user.manager === undefined ? (
                  <p className={styles.managerCardBody}>
                    Sign out and sign in again to load your manager details.
                  </p>
                ) : user.manager && (user.manager.email || user.manager.name) ? (
                  <>
                    <p className={styles.managerCardBody}>
                      Your manager is your main point of contact for leads, assignments, and questions about your
                      work in this workspace. Reach them by email below.
                    </p>
                    <p className={styles.managerName}>{getManagerDisplayLabel(user.manager)}</p>
                    {user.manager.email ? (
                      <a className={styles.managerMailto} href={`mailto:${user.manager.email}`}>
                        {user.manager.email}
                      </a>
                    ) : null}
                  </>
                ) : (
                  <p className={styles.managerCardBody}>
                    You do not have one main manager right now. Any manager in your workspace can assign leads to you
                    or work with you on leads.
                  </p>
                )}
              </div>
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

              <Select
                id="profile-datetime-mode"
                label="Dates and times"
                placeholder="Choose display"
                value={datetimeDisplayMode}
                onChange={(e) => setDatetimeDisplayMode(e.target.value)}
                options={[
                  {
                    value: DATETIME_DISPLAY_IST,
                    label: 'Use my selected timezone + format',
                  },
                  {
                    value: DATETIME_DISPLAY_BROWSER,
                    label: 'This device timezone (browser local) + my selected format',
                  },
                ]}
              />
              <Select
                id="profile-datetime-timezone"
                label="Timezone"
                value={datetimeTimezone}
                onChange={(e) => setDatetimeTimezone(e.target.value)}
                options={timezoneOptions}
              />
              <Select
                id="profile-date-format"
                label="Date format"
                value={datetimeDateFormat}
                onChange={(e) => setDatetimeDateFormat(e.target.value)}
                options={DATE_FORMAT_OPTIONS}
              />
              <Select
                id="profile-time-format"
                label="Time format"
                value={datetimeTimeFormat}
                onChange={(e) => setDatetimeTimeFormat(e.target.value)}
                options={TIME_FORMAT_OPTIONS}
              />
              <InfoHelpIcon
                title="Date/time settings info"
                modalTitle="Dates and times"
                message="Applies to lists and details across the app. In browser-local mode, timezone comes from your device while date/time format still follows these selections."
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
                    <div className={styles.passwordSectionTitle}>
                      <SectionIcon icon="lock" color="orange" size="sm" />
                      <h3 className={styles.sectionTitle}>Change password</h3>
                    </div>
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
                  <InfoHelpIcon
                    title="Password change info"
                    modalTitle="Change password"
                    message="Enter your current password and choose a new one (at least 8 characters)."
                  />
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
          </form>

          <section className={styles.card}>
            <div className={styles.infoCardHeader}>
              <SectionIcon icon="badge" color="green" size="sm" />
              <h3 className={styles.managerCardTitle}>Account details</h3>
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
          </section>
        </main>

        <aside className={styles.rightColumn}>
          <section className={styles.card}>
            <div className={styles.infoCardHeader}>
              <SectionIcon icon="credit_card" color="indigo" size="sm" />
              <h3 className={styles.managerCardTitle}>Billing &amp; plan</h3>
            </div>
            <p className={styles.planTitle}>Current plan</p>
            <p className={styles.planValue}>Workspace Plan</p>
            <InfoHelpIcon
              title="Billing info"
              modalTitle="Billing and plan"
              message="Billing information and usage metrics will appear here."
            />
            <Button type="button" variant="secondary" size="sm">
              Manage plan
            </Button>
          </section>

          <section className={styles.card}>
            <div className={styles.infoCardHeader}>
              <SectionIcon icon="extension" color="emerald" size="sm" />
              <h3 className={styles.managerCardTitle}>Add-ons</h3>
            </div>
            <InfoHelpIcon
              title="Add-ons info"
              modalTitle="Add-ons"
              message={'Power Dialer\nWhatsApp Integration\nAdvanced Reports\nAPI Access'}
            />
            <Button type="button" variant="secondary" size="sm">
              Browse add-ons
            </Button>
          </section>
        </aside>
      </div>
    </div>
  );
}
