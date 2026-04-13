import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useAppSelector } from '../app/hooks';
import { selectIsAuthenticated, selectUser, selectPermissions } from '../features/auth/authSelectors';
import { useTenant } from '../context/TenantContext';
import { AuthLayout } from '../layouts/AuthLayout';
import { AppShellLayout } from '../layouts/AppShellLayout';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { RegisterPage } from '../features/auth/pages/RegisterPage';
import { HomePage } from '../pages/HomePage';
import { TenantDashboardPage } from '../pages/TenantDashboardPage';
import { ProfilePage } from '../pages/ProfilePage';
import { PlatformDashboardPage } from '../pages/PlatformDashboardPage';
import { WorkflowMapPage } from '../pages/WorkflowMapPage';
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
import { IndustryLeadFieldsHubPage } from '../features/disposition/pages/admin/IndustryLeadFieldsHubPage';
import { DispoTypesPage } from '../features/disposition/pages/admin/DispoTypesPage';
import { DispoActionsPage } from '../features/disposition/pages/admin/DispoActionsPage';
import { ContactStatusesPage } from '../features/disposition/pages/admin/ContactStatusesPage';
import { ContactTemperaturesPage } from '../features/disposition/pages/admin/ContactTemperaturesPage';
import { DefaultDispositionsPage } from '../features/disposition/pages/admin/DefaultDispositionsPage';
import { DefaultDialingSetsPage } from '../features/disposition/pages/admin/DefaultDialingSetsPage';
import { TemplateVariablesPage } from '../features/disposition/pages/admin/TemplateVariablesPage';
import { CampaignTypesPage } from '../features/disposition/pages/admin/CampaignTypesPage';
import { CampaignStatusesPage } from '../features/disposition/pages/admin/CampaignStatusesPage';
import { WhatsAppAccountsPage } from '../features/whatsapp/WhatsAppAccountsPage';
import { WhatsAppTemplatesPage } from '../features/whatsapp/WhatsAppTemplatesPage';
import { WhatsAppMessagesPage } from '../features/whatsapp/WhatsAppMessagesPage';
import { WhatsAppLogsPage } from '../features/whatsapp/WhatsAppLogsPage';
import { EmailLayout } from '../features/email/EmailLayout';
import { EmailSentPage } from '../features/email/EmailSentPage';
import { EmailTemplatesPage } from '../features/email/EmailTemplatesPage';
import { EmailAccountsPage } from '../features/email/EmailAccountsPage';
import { MeetingsPage } from '../pages/MeetingsPage';
import { ContactsPage } from '../features/contacts/ContactsPage';
import { ContactCustomFieldsPage } from '../features/contacts/ContactCustomFieldsPage';
import { ContactTagsPage } from '../features/contacts/ContactTagsPage';
import { ContactFormPage } from '../features/contacts/ContactFormPage';
import { ContactImportPage } from '../features/contacts/ContactImportPage';
import { ContactImportHistoryPage } from '../features/contacts/ContactImportHistoryPage';
import { IntegrationsPage } from '../features/integrations/IntegrationsPage';
import { TenantCompanySettingsPage } from '../pages/TenantCompanySettingsPage';
import { CampaignsPage } from '../features/campaigns/CampaignsPage';
import { CampaignOpenPage } from '../features/campaigns/CampaignOpenPage';
import { DealsPage } from '../pages/DealsPage';
import { useEmailModuleEnabled } from '../hooks/useEmailModuleEnabled';
import { ActivitiesPage } from '../pages/ActivitiesPage';
import { DialerPage } from '../pages/DialerPage';
import { DialerSessionPage } from '../pages/DialerSessionPage';
import { DialerSessionSetupPage } from '../pages/DialerSessionSetupPage';
import { StandalonePageLayout } from '../layouts/StandalonePageLayout';

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

/** Old URL `/admin/masters/industries/:id/fields` → hub with `?industry=` pre-selected. */
function AdminIndustryFieldsLegacyRedirect() {
  const { industryId } = useParams();
  return (
    <Navigate
      to={`/admin/masters/industry-lead-fields?industry=${encodeURIComponent(industryId || '')}`}
      replace
    />
  );
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
          <ProtectedRoute permission={PERMISSIONS.DASHBOARD_VIEW}>
            <AppShellLayout>
              <TenantDashboardPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/workflow/map"
        element={
          <ProtectedRoute permission={PERMISSIONS.DASHBOARD_VIEW}>
            <AppShellLayout>
              <WorkflowMapPage variant="tenant" />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      {/* Dialer Workflow - matches sidebar /workflow/* */}
      <Route
        path="/workflow/dispositions"
        element={
          <ProtectedRoute
            permissions={[PERMISSIONS.DISPOSITIONS_MANAGE, PERMISSIONS.WORKFLOW_VIEW, PERMISSIONS.DIAL_EXECUTE]}
          >
            <AppShellLayout>
              <DispositionSettingsPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/workflow/dialing-sets"
        element={
          <ProtectedRoute
            permissions={[PERMISSIONS.DISPOSITIONS_MANAGE, PERMISSIONS.WORKFLOW_VIEW, PERMISSIONS.DIAL_EXECUTE]}
          >
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
          <ProtectedRoute
            permissions={[
              PERMISSIONS.SETTINGS_MANAGE,
              PERMISSIONS.WORKFLOW_VIEW,
              PERMISSIONS.DIAL_EXECUTE,
              PERMISSIONS.SCRIPTS_SELF,
            ]}
          >
            <AppShellLayout>
              <CallScriptsPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      {/* WhatsApp module (granular RBAC; settings.manage retains full access) */}
      <Route
        path="/whatsapp/accounts"
        element={
          <ProtectedRoute
            permissions={[
              PERMISSIONS.WHATSAPP_TEMPLATES_MANAGE,
              PERMISSIONS.WHATSAPP_ACCOUNTS_MANAGE,
              PERMISSIONS.SETTINGS_MANAGE,
            ]}
          >
            <AppShellLayout>
              <WhatsAppAccountsPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/whatsapp/templates"
        element={
          <ProtectedRoute
            permissions={[
              PERMISSIONS.WHATSAPP_VIEW,
              PERMISSIONS.SETTINGS_MANAGE,
              PERMISSIONS.DIAL_EXECUTE,
            ]}
          >
            <AppShellLayout>
              <WhatsAppTemplatesPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/whatsapp/messages"
        element={
          <ProtectedRoute
            permissions={[
              PERMISSIONS.WHATSAPP_VIEW,
              PERMISSIONS.SETTINGS_MANAGE,
              PERMISSIONS.DIAL_EXECUTE,
            ]}
          >
            <AppShellLayout>
              <WhatsAppMessagesPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/whatsapp/logs"
        element={
          <ProtectedRoute
            permissions={[PERMISSIONS.WHATSAPP_LOGS_VIEW, PERMISSIONS.SETTINGS_MANAGE]}
          >
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
            <ProtectedRoute
              permissions={[
                PERMISSIONS.EMAIL_VIEW,
                PERMISSIONS.SETTINGS_MANAGE,
                PERMISSIONS.DIAL_EXECUTE,
              ]}
            >
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
        path="/email/meetings"
        element={
          <EmailModuleGate>
            <ProtectedRoute permissions={[PERMISSIONS.MEETINGS_VIEW, PERMISSIONS.SETTINGS_MANAGE]}>
              <AppShellLayout>
                <EmailLayout>
                  <MeetingsPage />
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
            <ProtectedRoute
              permissions={[
                PERMISSIONS.EMAIL_VIEW,
                PERMISSIONS.SETTINGS_MANAGE,
                PERMISSIONS.DIAL_EXECUTE,
              ]}
            >
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
            <ProtectedRoute
              permissions={[
                PERMISSIONS.EMAIL_TEMPLATES_MANAGE,
                PERMISSIONS.EMAIL_ACCOUNTS_MANAGE,
                PERMISSIONS.SETTINGS_MANAGE,
              ]}
            >
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
        path="/leads/import/history"
        element={
          <ProtectedRoute permissions={[PERMISSIONS.LEADS_READ, PERMISSIONS.LEADS_CREATE]}>
            <AppShellLayout>
              <ContactImportHistoryPage type="lead" />
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
        path="/campaigns"
        element={
          <ProtectedRoute permissions={[PERMISSIONS.CONTACTS_READ, PERMISSIONS.LEADS_READ]}>
            <AppShellLayout>
              <CampaignsPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/campaigns/:id/open"
        element={
          <ProtectedRoute permissions={[PERMISSIONS.CONTACTS_READ, PERMISSIONS.LEADS_READ]}>
            <AppShellLayout>
              <CampaignOpenPage />
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
        path="/contacts/import/history"
        element={
          <ProtectedRoute permissions={[PERMISSIONS.CONTACTS_READ, PERMISSIONS.CONTACTS_CREATE]}>
            <AppShellLayout>
              <ContactImportHistoryPage type="contact" />
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
              <DealsPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/dialer"
        element={
          <ProtectedRoute permission={PERMISSIONS.DIAL_EXECUTE}>
            <AppShellLayout>
              <DialerPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/dialer/session/setup"
        element={
          <ProtectedRoute permission={PERMISSIONS.DIAL_EXECUTE}>
            <StandalonePageLayout>
              <DialerSessionSetupPage />
            </StandalonePageLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/dialer/session/:id"
        element={
          <ProtectedRoute permission={PERMISSIONS.DIAL_EXECUTE}>
            <StandalonePageLayout>
              <DialerSessionPage />
            </StandalonePageLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/calls/history"
        element={
          <ProtectedRoute permission={PERMISSIONS.DIAL_EXECUTE}>
            <AppShellLayout>
              <ActivitiesPage />
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
              <TenantCompanySettingsPage />
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
        path="/settings/contact-tags"
        element={
          <ProtectedRoute permissions={[PERMISSIONS.CONTACTS_UPDATE, PERMISSIONS.LEADS_UPDATE]}>
            <AppShellLayout>
              <ContactTagsPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/integrations"
        element={
          <ProtectedRoute permission={PERMISSIONS.SETTINGS_MANAGE}>
            <AppShellLayout>
              <IntegrationsPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute permissions={[PERMISSIONS.USERS_MANAGE, PERMISSIONS.USERS_TEAM]}>
            <AppShellLayout>
              <TenantUsersPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <AppShellLayout>
              <ProfilePage />
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
        path="/admin/workflow/map"
        element={
          <ProtectedRoute>
            <AppShellLayout>
              <WorkflowMapPage variant="platform" />
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
        path="/admin/masters/industry-lead-fields"
        element={
          <ProtectedRoute>
            <AppShellLayout>
              <IndustryLeadFieldsHubPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/masters/industries/:industryId/fields"
        element={
          <ProtectedRoute>
            <AppShellLayout>
              <AdminIndustryFieldsLegacyRedirect />
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
      <Route
        path="/admin/masters/campaign-types"
        element={
          <ProtectedRoute>
            <AppShellLayout>
              <CampaignTypesPage />
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/masters/campaign-statuses"
        element={
          <ProtectedRoute>
            <AppShellLayout>
              <CampaignStatusesPage />
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
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <AppShellLayout>
              <ProfilePage />
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
