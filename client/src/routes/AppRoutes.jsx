import { Routes, Route, Navigate } from 'react-router-dom';
import { useAppSelector } from '../app/hooks';
import { selectIsAuthenticated, selectUser, selectPermissions } from '../features/auth/authSelectors';
import { useTenant } from '../context/TenantContext';
import { AuthLayout } from '../layouts/AuthLayout';
import { AppShellLayout } from '../layouts/AppShellLayout';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { RegisterPage } from '../features/auth/pages/RegisterPage';
import { HomePage } from '../pages/HomePage';
import { PlatformDashboardPage } from '../pages/PlatformDashboardPage';
import { TenantsPage } from '../pages/TenantsPage';
import { UsersPage } from '../pages/UsersPage';
import { TenantUsersPage } from '../pages/TenantUsersPage';
import { UnauthorizedPage } from '../pages/UnauthorizedPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { CallScriptsPage } from '../features/callScripts/CallScriptsPage';
import { hasPermission, hasAnyPermission, PERMISSIONS } from '../utils/permissionUtils';
import { DispositionSettingsPage } from '../features/disposition/pages/tenant/DispositionSettingsPage';
import { DispositionAdminPage } from '../features/disposition/pages/admin/DispositionAdminPage';
import { IndustriesPage } from '../features/disposition/pages/admin/IndustriesPage';
import { DispoTypesPage } from '../features/disposition/pages/admin/DispoTypesPage';
import { DispoActionsPage } from '../features/disposition/pages/admin/DispoActionsPage';
import { ContactStatusesPage } from '../features/disposition/pages/admin/ContactStatusesPage';
import { ContactTemperaturesPage } from '../features/disposition/pages/admin/ContactTemperaturesPage';
import { DefaultDispositionsPage } from '../features/disposition/pages/admin/DefaultDispositionsPage';
import { DefaultDialingSetsPage } from '../features/disposition/pages/admin/DefaultDialingSetsPage';
import { TemplateVariablesPage } from '../features/disposition/pages/admin/TemplateVariablesPage';
import { WhatsAppAccountsPage } from '../features/whatsapp/WhatsAppAccountsPage';
import { WhatsAppTemplatesPage } from '../features/whatsapp/WhatsAppTemplatesPage';
import { WhatsAppMessagesPage } from '../features/whatsapp/WhatsAppMessagesPage';
import { WhatsAppLogsPage } from '../features/whatsapp/WhatsAppLogsPage';
import { EmailLayout } from '../features/email/EmailLayout';
import { EmailSentPage } from '../features/email/EmailSentPage';
import { EmailTemplatesPage } from '../features/email/EmailTemplatesPage';
import { EmailAccountsPage } from '../features/email/EmailAccountsPage';
import { ContactsPage } from '../features/contacts/ContactsPage';
import { ContactCustomFieldsPage } from '../features/contacts/ContactCustomFieldsPage';
import { ContactFormPage } from '../features/contacts/ContactFormPage';
import { ContactImportPage } from '../features/contacts/ContactImportPage';
import { useEmailModuleEnabled } from '../hooks/useEmailModuleEnabled';

/**
 * Renders children only when email module is enabled for the tenant; otherwise redirects to dashboard.
 */
function EmailModuleGate({ children }) {
  const { emailModuleEnabled, loading } = useEmailModuleEnabled();
  if (loading) return null;
  if (!emailModuleEnabled) return <Navigate to="/" replace />;
  return children;
}

/**
 * ProtectedRoute with permission-based access control.
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components to render
 * @param {string} [props.permission] - Single permission required
 * @param {string[]} [props.permissions] - Array of permissions (any match = allowed)
 * @param {string} [props.redirectTo] - Custom redirect path for unauthorized (default: /unauthorized)
 */
function ProtectedRoute({ children, permission, permissions, redirectTo = '/unauthorized' }) {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const user = useAppSelector(selectUser);
  const userPermissions = useAppSelector(selectPermissions);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Platform admins bypass all permission checks
  if (user?.isPlatformAdmin) {
    return children;
  }

  // Check single permission
  if (permission && !hasPermission(user, permission, userPermissions)) {
    return <Navigate to={redirectTo} replace />;
  }

  // Check array of permissions (any match = allowed)
  if (permissions && permissions.length > 0 && !hasAnyPermission(user, permissions, userPermissions)) {
    return <Navigate to={redirectTo} replace />;
  }

  return children;
}

function PublicOnlyRoute({ children }) {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function MarketingRoutes() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <LoginPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnlyRoute>
              <RegisterPage />
            </PublicOnlyRoute>
          }
        />
      </Route>
      <Route path="/" element={<HomePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function TenantRoutes() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <LoginPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnlyRoute>
              <RegisterPage />
            </PublicOnlyRoute>
          }
        />
      </Route>
      <Route
        path="/unauthorized"
        element={
          <ProtectedRoute>
            <UnauthorizedPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShellLayout>
              <HomePage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      {/* Dialer Workflow - matches sidebar /workflow/* */}
      <Route
        path="/workflow/dispositions"
        element={
          <ProtectedRoute permission={PERMISSIONS.DISPOSITIONS_MANAGE}>
            <AppShellLayout>
              <DispositionSettingsPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/workflow/dialing-sets"
        element={
          <ProtectedRoute permission={PERMISSIONS.DISPOSITIONS_MANAGE}>
            <AppShellLayout>
              <DispositionSettingsPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      {/* Dialer Resources - matches sidebar /resources/*; legacy email-templates redirects to Email module */}
      <Route path="/resources/email-templates" element={<Navigate to="/email/templates" replace />} />
      <Route
        path="/resources/dialer-scripts"
        element={
          <ProtectedRoute permission={PERMISSIONS.SETTINGS_MANAGE}>
            <AppShellLayout>
              <CallScriptsPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      {/* WhatsApp module */}
      <Route
        path="/whatsapp/accounts"
        element={
          <ProtectedRoute permission={PERMISSIONS.SETTINGS_MANAGE}>
            <AppShellLayout>
              <WhatsAppAccountsPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/whatsapp/templates"
        element={
          <ProtectedRoute permission={PERMISSIONS.SETTINGS_MANAGE}>
            <AppShellLayout>
              <WhatsAppTemplatesPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/whatsapp/messages"
        element={
          <ProtectedRoute permission={PERMISSIONS.SETTINGS_MANAGE}>
            <AppShellLayout>
              <WhatsAppMessagesPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/whatsapp/logs"
        element={
          <ProtectedRoute permission={PERMISSIONS.SETTINGS_MANAGE}>
            <AppShellLayout>
              <WhatsAppLogsPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      {/* Email module (hidden and inaccessible when email_module_enabled is false) */}
      <Route path="/email" element={<Navigate to="/email/sent" replace />} />
      <Route
        path="/email/sent"
        element={
          <EmailModuleGate>
            <ProtectedRoute permission={PERMISSIONS.SETTINGS_MANAGE}>
              <AppShellLayout>
                <EmailLayout>
                  <EmailSentPage />
                </EmailLayout>
              </AppShellLayout>
            </ProtectedRoute>
          </EmailModuleGate>
        }
      />
      <Route
        path="/email/templates"
        element={
          <EmailModuleGate>
            <ProtectedRoute permission={PERMISSIONS.SETTINGS_MANAGE}>
              <AppShellLayout>
                <EmailLayout>
                  <EmailTemplatesPage />
                </EmailLayout>
              </AppShellLayout>
            </ProtectedRoute>
          </EmailModuleGate>
        }
      />
      <Route
        path="/email/accounts"
        element={
          <EmailModuleGate>
            <ProtectedRoute permission={PERMISSIONS.SETTINGS_MANAGE}>
              <AppShellLayout>
                <EmailLayout>
                  <EmailAccountsPage />
                </EmailLayout>
              </AppShellLayout>
            </ProtectedRoute>
          </EmailModuleGate>
        }
      />
      {/* Legacy path for dispositions (redirect to workflow) */}
      <Route path="/dispositions" element={<Navigate to="/workflow/dispositions" replace />} />
      {/* Other tenant sidebar links - placeholders */}
      <Route
        path="/leads"
        element={
          <ProtectedRoute permission={PERMISSIONS.LEADS_READ}>
            <AppShellLayout>
              <ContactsPage type="lead" />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leads/import"
        element={
          <ProtectedRoute permission={PERMISSIONS.LEADS_CREATE}>
            <AppShellLayout>
              <ContactImportPage type="lead" />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leads/new"
        element={
          <ProtectedRoute permission={PERMISSIONS.LEADS_CREATE}>
            <AppShellLayout>
              <ContactFormPage defaultType="lead" />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leads/:id"
        element={
          <ProtectedRoute permission={PERMISSIONS.LEADS_READ}>
            <AppShellLayout>
              <ContactFormPage defaultType="lead" />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/contacts"
        element={
          <ProtectedRoute permission={PERMISSIONS.CONTACTS_READ}>
            <AppShellLayout>
              <ContactsPage type="contact" />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/contacts/import"
        element={
          <ProtectedRoute permission={PERMISSIONS.CONTACTS_CREATE}>
            <AppShellLayout>
              <ContactImportPage type="contact" />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/contacts/new"
        element={
          <ProtectedRoute permission={PERMISSIONS.CONTACTS_CREATE}>
            <AppShellLayout>
              <ContactFormPage defaultType="contact" />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/contacts/:id"
        element={
          <ProtectedRoute permission={PERMISSIONS.CONTACTS_READ}>
            <AppShellLayout>
              <ContactFormPage defaultType="contact" />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/deals"
        element={
          <ProtectedRoute permission={PERMISSIONS.PIPELINES_MANAGE}>
            <AppShellLayout>
              <PlaceholderPage title="Deals" />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/activities"
        element={
          <ProtectedRoute permission={PERMISSIONS.DIAL_EXECUTE}>
            <AppShellLayout>
              <PlaceholderPage title="Activities" />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute permission={PERMISSIONS.REPORTS_VIEW}>
            <AppShellLayout>
              <PlaceholderPage title="Reports" />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute permission={PERMISSIONS.SETTINGS_MANAGE}>
            <AppShellLayout>
              <PlaceholderPage title="Settings" />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/contact-fields"
        element={
          <ProtectedRoute permission={PERMISSIONS.SETTINGS_MANAGE}>
            <AppShellLayout>
              <ContactCustomFieldsPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute permission={PERMISSIONS.USERS_MANAGE}>
            <AppShellLayout>
              <TenantUsersPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function PlatformRoutes() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <LoginPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnlyRoute>
              <RegisterPage />
            </PublicOnlyRoute>
          }
        />
      </Route>
      <Route
        path="/unauthorized"
        element={
          <ProtectedRoute>
            <UnauthorizedPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShellLayout>
              <PlatformDashboardPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/tenants"
        element={
          <ProtectedRoute>
            <AppShellLayout>
              <TenantsPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <ProtectedRoute>
            <AppShellLayout>
              <UsersPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/dispositions"
        element={
          <ProtectedRoute>
            <AppShellLayout>
              <DispositionAdminPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      {/* Masters Routes */}
      <Route
        path="/admin/masters/industries"
        element={
          <ProtectedRoute>
            <AppShellLayout>
              <IndustriesPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/masters/dispo-types"
        element={
          <ProtectedRoute>
            <AppShellLayout>
              <DispoTypesPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/masters/actions"
        element={
          <ProtectedRoute>
            <AppShellLayout>
              <DispoActionsPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/masters/contact-statuses"
        element={
          <ProtectedRoute>
            <AppShellLayout>
              <ContactStatusesPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/masters/temperatures"
        element={
          <ProtectedRoute>
            <AppShellLayout>
              <ContactTemperaturesPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/masters/template-variables"
        element={
          <ProtectedRoute>
            <AppShellLayout>
              <TemplateVariablesPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      {/* Call Workflow Routes */}
      <Route
        path="/admin/workflow/default-dispositions"
        element={
          <ProtectedRoute>
            <AppShellLayout>
              <DefaultDispositionsPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/workflow/default-dialing-sets"
        element={
          <ProtectedRoute>
            <AppShellLayout>
              <DefaultDialingSetsPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function AppRoutes() {
  const { isMarketing, isPlatform, isTenant } = useTenant();

  if (isMarketing) {
    return <MarketingRoutes />;
  }

  if (isPlatform) {
    return <PlatformRoutes />;
  }

  if (isTenant) {
    return <TenantRoutes />;
  }

  // Development fallback (e.g. localhost without explicit domain):
  // default to tenant routes so the app is usable in dev.
  return <TenantRoutes />;
}
