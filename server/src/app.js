import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { env } from './config/env.js';
import { initRedis } from './config/redis.js';
import { tenantResolver } from './middleware/tenantResolver.js';

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

// Tenant routes
import dialingSetsRoutes from './routes/tenant/dialingSets.js';
import dispositionsRoutes from './routes/tenant/dispositions.js';
import dialingSetDispositionsRoutes from './routes/tenant/dialingSetDispositions.js';
import dispositionActionsMapRoutes from './routes/tenant/dispositionActionsMap.js';
import emailTemplatesRoutes from './routes/tenant/emailTemplates.js';
import whatsappTemplatesRoutes from './routes/tenant/whatsappTemplates.js';
import callScriptsRoutes from './routes/tenant/callScripts.js';
import contactsRoutes from './routes/tenant/contacts.js';
import contactTagsRoutes from './routes/tenant/contactTags.js';
import contactCustomFieldsRoutes from './routes/tenant/contactCustomFields.js';
import integrationsRoutes from './routes/tenant/integrations.js';
import tenantUsersRoutes from './routes/tenant/users.js';
import tenantCompanyRoutes from './routes/tenant/company.js';
import contactDeletePolicyRoutes from './routes/tenant/contactDeletePolicy.js';
import dialerPreferencesRoutes from './routes/tenant/dialerPreferences.js';
import tenantDashboardRoutes from './routes/tenant/dashboard.js';
import campaignsRoutes from './routes/tenant/campaigns.js';
import dealsRoutes from './routes/tenant/deals.js';
import opportunitiesRoutes from './routes/tenant/opportunities.js';
import whatsappModuleRoutes from './routes/tenant/whatsapp.js';
import whatsappWebhookRoutes from './routes/whatsappWebhook.js';
import emailModuleRoutes from './routes/tenant/email.js';
import templateVariablesRoutes from './routes/templateVariables.js';
import integrationsWebhookRoutes from './routes/integrationsWebhook.js';
import callsRoutes from './routes/tenant/calls.js';
import dialerSessionsRoutes from './routes/tenant/dialerSessions.js';
import savedListFiltersRoutes from './routes/tenant/savedListFilters.js';

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

// Resolve tenant/platform context from subdomain for all API routes
app.use(tenantResolver);

// Auth routes
app.use('/api/auth', authRoutes);

// Template variables (system-level, any authenticated user)
app.use('/api/template-variables', templateVariablesRoutes);

// Super Admin routes (platform admin only)
app.use('/api/admin/industries', industriesRoutes);
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
app.use('/api/tenant/dashboard', tenantDashboardRoutes);
app.use('/api/tenant/campaigns', campaignsRoutes);
app.use('/api/tenant/deals', dealsRoutes);
app.use('/api/tenant/opportunities', opportunitiesRoutes);
app.use('/api/tenant/whatsapp', whatsappModuleRoutes);
app.use('/api/tenant/email', emailModuleRoutes);
app.use('/api/tenant/contacts', contactsRoutes);
app.use('/api/tenant/contact-tags', contactTagsRoutes);
app.use('/api/tenant/contact-custom-fields', contactCustomFieldsRoutes);
app.use('/api/tenant/integrations', integrationsRoutes);
app.use('/api/tenant/calls', callsRoutes);
app.use('/api/tenant/dialer-sessions', dialerSessionsRoutes);
app.use('/api/tenant/saved-list-filters', savedListFiltersRoutes);

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

  app.listen(port, () => {
    console.log(`Call Nest API listening on port ${port}`);
    console.log(`Environment: ${env.appEnv}`);
  });
}

start();
