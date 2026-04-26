import * as integrationAuthService from '../services/public/integrationAuthService.js';

function readApiKey(req) {
  const h = req.headers['x-api-key'] || req.headers['x-callnest-api-key'];
  if (h) return String(h).trim();
  const auth = String(req.headers.authorization || '').trim();
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return null;
}

export async function publicIntegrationAuth(req, res, next) {
  try {
    const apiKey = readApiKey(req);
    const app = await integrationAuthService.authenticatePublicRequest(apiKey);
    if (!app) return res.status(401).json({ error: 'Invalid API key' });
    const rate = integrationAuthService.checkRateLimit(app);
    if (!rate.allowed) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        limit: rate.limit,
        reset_at: new Date(rate.resetAt).toISOString(),
      });
    }
    req.publicIntegrationApp = app;
    req.tenant = { id: Number(app.tenant_id) };
    return next();
  } catch (err) {
    return next(err);
  }
}

export function requirePublicScope(scope) {
  return (req, res, next) => {
    const app = req.publicIntegrationApp;
    if (!app) return res.status(401).json({ error: 'Integration app required' });
    if (!integrationAuthService.requireScope(app, scope)) {
      return res.status(403).json({ error: 'Missing scope', required: scope });
    }
    return next();
  };
}
