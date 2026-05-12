import http from 'http';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { env } from './config/env.js';
import { initRedis } from './config/redis.js';
import { tenantResolver } from './middleware/tenantResolver.js';
import publicRoutes from './routes/publicRoutes.js';
import razorpayWebhookRoutes from './routes/public/razorpayWebhook.js';

// Super Admin routes
import industriesRoutes from './routes/superAdmin/industries.js';
import dispoTypesMasterRoutes from './routes/superAdmin/dispoTypesMaster.js';
import dispoActionsMasterRoutes from './routes/superAdmin/dispoActionsMaster.js';
import contactStatusMasterRoutes from './routes/superAdmin/contactStatusMaster.js';
import contactTemperatureMasterRoutes from './routes/superAdmin/contactTemperatureMaster.js';
import defaultDispositionsRoutes from './routes/superAdmin/defaultDispositions.js';
import defaultDialingSetsRoutes from './routes/superAdmin/defaultDialingSets.js';
import defaultDialingSetDispositionsRoutes from './routes/superAdmin/defaultDialingSetDispositions.js';
import defaultDispositionActionsMapRoutes from './routes/superAdmin/defaultDispositionActionsMap.js';
import templateVariablesAdminRoutes from './routes/superAdmin/templateVariables.js';
import tenantsAdminRoutes from './routes/superAdmin/tenants.js';
import platformUsersAdminRoutes from './routes/superAdmin/platformUsers.js';
import dashboardAdminRoutes from './routes/superAdmin/dashboard.js';
import campaignTypesMasterRoutes from './routes/superAdmin/campaignTypesMaster.js';
import campaignStatusesMasterRoutes from './routes/superAdmin/campaignStatusesMaster.js';
import industryFieldDefinitionsRoutes from './routes/superAdmin/industryFieldDefinitions.js';
import platformBillingRoutes from './routes/superAdmin/billing.js';
import dialerPhoneNumbersAdminRoutes from './routes/superAdmin/dialerPhoneNumbers.js';
import tenantTelephonyAdminRoutes from './routes/superAdmin/tenantTelephony.js';

// Tenant routes
import dialingSetsRoutes from './routes/tenant/dialingSets.js';
import dispositionsRoutes from './routes/tenant/dispositions.js';
import dialingSetDispositionsRoutes from './routes/tenant/dialingSetDispositions.js';
import dispositionActionsMapRoutes from './routes/tenant/dispositionActionsMap.js';
import emailTemplatesRoutes from './routes/tenant/emailTemplates.js';
import whatsappTemplatesRoutes from './routes/tenant/whatsappTemplates.js';
import callScriptsRoutes from './routes/tenant/callScripts.js';
import contactsRoutes from './routes/tenant/contacts.js';
import contactBlacklistRoutes from './routes/tenant/contactBlacklist.js';
import contactTagsRoutes from './routes/tenant/contactTags.js';
import contactCustomFieldsRoutes from './routes/tenant/contactCustomFields.js';
import integrationsRoutes from './routes/tenant/integrations.js';
import tenantUsersRoutes from './routes/tenant/users.js';
import tenantCompanyRoutes from './routes/tenant/company.js';
import contactDeletePolicyRoutes from './routes/tenant/contactDeletePolicy.js';
import dialerPreferencesRoutes from './routes/tenant/dialerPreferences.js';
import dialerWorkspaceConfigRoutes from './routes/tenant/dialerWorkspaceConfig.js';
import dialerPhoneNumbersRoutes from './routes/tenant/dialerPhoneNumbers.js';
import phoneInsightRoutes from './routes/tenant/phoneInsight.js';
import tenantDashboardRoutes from './routes/tenant/dashboard.js';
import campaignsRoutes from './routes/tenant/campaigns.js';
import dealsRoutes from './routes/tenant/deals.js';
import opportunitiesRoutes from './routes/tenant/opportunities.js';
import whatsappModuleRoutes from './routes/tenant/whatsapp.js';
import whatsappWebhookRoutes from './routes/whatsappWebhook.js';
import emailModuleRoutes from './routes/tenant/email.js';
import templateVariablesRoutes from './routes/templateVariables.js';
import integrationsWebhookRoutes from './routes/integrationsWebhook.js';
import dialerPublicRoutes from './routes/public/dialerPublic.js';
import exotelWebhookRoutes from './routes/public/exotelWebhook.js';
import knowlarityWebhookRoutes from './routes/public/knowlarityWebhook.js';
import ozonetelWebhookRoutes from './routes/public/ozonetelWebhook.js';
import meetingFeedbackPublicRoutes from './routes/public/meetingFeedback.js';
import callsRoutes from './routes/tenant/calls.js';
import dialerSessionsRoutes from './routes/tenant/dialerSessions.js';
import savedListFiltersRoutes from './routes/tenant/savedListFilters.js';
import meetingsRoutes from './routes/tenant/meetings.js';
import tenantIndustryFieldsRoutes from './routes/tenant/industryFields.js';
import backgroundJobsRoutes from './routes/tenant/backgroundJobs.js';
import scheduleHubRoutes from './routes/tenant/scheduleHub.js';
import taskManagerRoutes from './routes/tenant/taskManager.js';
import reportsHubRoutes from './routes/tenant/reportsHub.js';
import notificationsRoutes from './routes/tenant/notifications.js';
import billingRoutes from './routes/tenant/billing.js';
import telephonyAccountsRoutes from './routes/tenant/telephonyAccounts.js';
import callCreditsRoutes from './routes/tenant/callCredits.js';
import { initTenantRealtimeSocket } from './realtime/tenantRealtimeSocket.js';
import { startTenantBackgroundJobWorker } from './workers/tenantBackgroundJobWorker.js';
import { startMeetingReminderFeedbackWorker } from './workers/meetingReminderFeedbackWorker.js';

const app = express();

if (env.isProduction) {
  app.set('trust proxy', 1);
}

function productionCorsAllowed(origin) {
  if (!origin) return true;
  if (env.corsOrigins.includes(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    const hostLower = hostname.toLowerCase();
    if (
      env.bootstrapHosts.length &&
      env.bootstrapHosts.includes(hostLower)
    ) {
      return true;
    }
    if (env.corsOriginSuffix && hostLower.endsWith(env.corsOriginSuffix)) {
      return true;
    }
  } catch {
    return false;
  }
  if (env.frontendUrl && origin === env.frontendUrl) return true;
  return false;
}

// Middleware
app.use(
  cors({
    credentials: true,
    origin: env.isProduction
      ? (origin, callback) => {
          callback(null, productionCorsAllowed(origin));
        }
      : true,
  })
);

// Razorpay webhooks require raw body for signature verification (must run before express.json)
app.use(
  '/api/public/billing/razorpay-webhook',
  express.raw({ type: 'application/json' }),
  razorpayWebhookRoutes
);

app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Twilio status callbacks use form-encoded body

// Health check
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    environment: env.appEnv,
  });
});

// Public WhatsApp webhook (before tenantResolver so ngrok/Twilio host doesn't get 404)
app.use('/api/whatsapp/webhook', whatsappWebhookRoutes);

// Public Integrations webhooks (before tenantResolver so providers don't need tenant subdomain)
app.use('/api/integrations/webhook', integrationsWebhookRoutes);

// Public workspace discovery (before tenantResolver; resolver skips /api/public/*)
app.use('/api/public', publicRoutes);
app.use('/api/public/v1/dialer', dialerPublicRoutes);
app.use('/api/public/telephony/exotel', exotelWebhookRoutes);
app.use('/api/public/telephony/knowlarity', knowlarityWebhookRoutes);
app.use('/api/public/telephony/ozonetel', ozonetelWebhookRoutes);
app.use('/api/public/meetings/feedback', meetingFeedbackPublicRoutes);

// Resolve tenant/platform context from subdomain for all API routes
app.use(tenantResolver);

// Auth routes
app.use('/api/auth', authRoutes);

// Template variables (system-level, any authenticated user)
app.use('/api/template-variables', templateVariablesRoutes);

// Super Admin routes (platform admin only)
app.use('/api/admin/industries', industriesRoutes);
app.use('/api/admin/industries/:industryId/field-definitions', industryFieldDefinitionsRoutes);
app.use('/api/admin/dispo-types', dispoTypesMasterRoutes);
app.use('/api/admin/dispo-actions', dispoActionsMasterRoutes);
app.use('/api/admin/contact-statuses', contactStatusMasterRoutes);
app.use('/api/admin/contact-temperatures', contactTemperatureMasterRoutes);
app.use('/api/admin/default-dispositions', defaultDispositionsRoutes);
app.use('/api/admin/default-dialing-sets', defaultDialingSetsRoutes);
app.use('/api/admin/default-dialing-set-dispositions', defaultDialingSetDispositionsRoutes);
app.use('/api/admin/default-disposition-actions', defaultDispositionActionsMapRoutes);
app.use('/api/admin/template-variables', templateVariablesAdminRoutes);
app.use('/api/admin/tenants', tenantsAdminRoutes);
app.use('/api/admin/users', platformUsersAdminRoutes);
app.use('/api/admin/dashboard', dashboardAdminRoutes);
app.use('/api/admin/campaign-types', campaignTypesMasterRoutes);
app.use('/api/admin/campaign-statuses', campaignStatusesMasterRoutes);
app.use('/api/admin/billing', platformBillingRoutes);
app.use('/api/admin/dialer-phone-numbers', dialerPhoneNumbersAdminRoutes);
app.use('/api/admin/tenant-telephony', tenantTelephonyAdminRoutes);

// Tenant routes (tenant users only)
app.use('/api/tenant/dialing-sets', dialingSetsRoutes);
app.use('/api/tenant/dispositions', dispositionsRoutes);
app.use('/api/tenant/dialing-set-dispositions', dialingSetDispositionsRoutes);
app.use('/api/tenant/disposition-actions', dispositionActionsMapRoutes);
app.use('/api/tenant/email-templates', emailTemplatesRoutes);
app.use('/api/tenant/whatsapp-templates', whatsappTemplatesRoutes);
app.use('/api/tenant/call-scripts', callScriptsRoutes);
app.use('/api/tenant/users', tenantUsersRoutes);
app.use('/api/tenant/company', tenantCompanyRoutes);
app.use('/api/tenant/contact-delete-policy', contactDeletePolicyRoutes);
app.use('/api/tenant/dialer-preferences', dialerPreferencesRoutes);
app.use('/api/tenant/dialer-workspace-config', dialerWorkspaceConfigRoutes);
app.use('/api/tenant/dialer-phone-numbers', dialerPhoneNumbersRoutes);
app.use('/api/tenant/phone-insight', phoneInsightRoutes);
app.use('/api/tenant/dashboard', tenantDashboardRoutes);
app.use('/api/tenant/campaigns', campaignsRoutes);
app.use('/api/tenant/deals', dealsRoutes);
app.use('/api/tenant/opportunities', opportunitiesRoutes);
app.use('/api/tenant/whatsapp', whatsappModuleRoutes);
app.use('/api/tenant/email', emailModuleRoutes);
app.use('/api/tenant/contacts', contactsRoutes);
app.use('/api/tenant/contact-blacklist', contactBlacklistRoutes);
app.use('/api/tenant/contact-tags', contactTagsRoutes);
app.use('/api/tenant/contact-custom-fields', contactCustomFieldsRoutes);
app.use('/api/tenant/integrations', integrationsRoutes);
app.use('/api/tenant/calls', callsRoutes);
app.use('/api/tenant/dialer-sessions', dialerSessionsRoutes);
app.use('/api/tenant/saved-list-filters', savedListFiltersRoutes);
app.use('/api/tenant/meetings', meetingsRoutes);
app.use('/api/tenant/industry-fields', tenantIndustryFieldsRoutes);
app.use('/api/tenant/background-jobs', backgroundJobsRoutes);
app.use('/api/tenant/schedule-hub', scheduleHubRoutes);
app.use('/api/tenant/task-manager', taskManagerRoutes);
app.use('/api/tenant/reports', reportsHubRoutes);
app.use('/api/tenant/notifications', notificationsRoutes);
app.use('/api/tenant/billing', billingRoutes);
app.use('/api/tenant/telephony-accounts', telephonyAccountsRoutes);
app.use('/api/tenant/call-credits', callCreditsRoutes);

// Error handler (must be last)
app.use(errorHandler);

// Start server (ensure Redis is initialized first, but do not block startup on failure)
const port = env.port;

async function start() {
  try {
    await initRedis();
  } catch (err) {
    console.error('Failed to connect to Redis. Continuing without cache layer.', err);
  }

  const httpServer = http.createServer(app);

  try {
    await initTenantRealtimeSocket(httpServer);
  } catch (err) {
    console.error('[tenant-socket] Init failed:', err);
    process.exit(1);
  }

  httpServer.listen(port, () => {
    console.log(`Call Nest API listening on port ${port}`);
    console.log(`Environment: ${env.appEnv}`);
    startTenantBackgroundJobWorker();
    startMeetingReminderFeedbackWorker();
  });
}

start();
