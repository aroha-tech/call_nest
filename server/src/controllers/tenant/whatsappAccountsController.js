import * as whatsappAccountService from '../../services/tenant/whatsappAccountService.js';
import { testConnection as testConnectionOrchestrator, listTemplatesFromProvider } from '../../services/whatsapp/sendWhatsappMessage.js';

export async function testConnection(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const { account_id, provider, api_key, api_secret, external_account_id, phone_number } = req.body || {};

    let credentials = {
      provider: (provider || 'meta').trim(),
      api_key: api_key?.trim() || null,
      api_secret: api_secret?.trim() || null,
      external_account_id: external_account_id?.trim() || null,
      phone_number: phone_number?.trim() || null,
    };

    if (account_id) {
      const account = await whatsappAccountService.findById(tenantId, account_id);
      if (!account) {
        return res.status(404).json({ error: 'WhatsApp account not found' });
      }
      // Merge: use form values when provided, otherwise stored (so edit tests with current form + stored for masked)
      credentials = {
        provider: credentials.provider || account.provider,
        api_key: credentials.api_key || account.api_key || null,
        api_secret: credentials.api_secret || account.api_secret || null,
        external_account_id: credentials.external_account_id ?? account.external_account_id ?? null,
        phone_number: credentials.phone_number ?? account.phone_number ?? null,
      };
    }

    const needsKey = ['meta', 'gupshup', 'kaleyra', 'interakt'].includes(credentials.provider);
    const needsSecret = credentials.provider === 'twilio';
    if (needsKey && !credentials.api_key) {
      return res.status(400).json({ error: 'api_key is required' });
    }
    if (needsSecret && !credentials.api_secret) {
      return res.status(400).json({ error: 'Auth Token (api_secret) is required' });
    }

    await testConnectionOrchestrator(tenantId, null, credentials);
    res.json({ success: true, message: 'Connection successful' });
  } catch (err) {
    const status = err.status || 400;
    res.status(status).json({ error: err.message || 'Connection failed' });
  }
}

export async function getAll(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const includeInactive = req.query.include_inactive === 'true';
    const accounts = await whatsappAccountService.findAll(tenantId, includeInactive);
    res.json({ data: accounts });
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const account = await whatsappAccountService.findById(tenantId, req.params.id);
    if (!account) {
      return res.status(404).json({ error: 'WhatsApp account not found' });
    }
    res.json({ data: account });
  } catch (err) {
    next(err);
  }
}

/** GET /accounts/:id/templates — fetch template list from provider (Twilio, Meta, etc.). Query: waba_id (for Meta). */
export async function getTemplatesFromProvider(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const accountId = req.params.id;
    const wabaId = req.query.waba_id?.trim() || null;
    const list = await listTemplatesFromProvider(tenantId, accountId, { waba_id: wabaId });
    res.json({ data: list });
  } catch (err) {
    const status = err.status || 400;
    res.status(status).json({ error: err.message || 'Failed to fetch templates from provider' });
  }
}

export async function create(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const account = await whatsappAccountService.create(tenantId, req.body, req.user.id);
    res.status(201).json({ data: account });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const account = await whatsappAccountService.update(
      tenantId,
      req.params.id,
      req.body,
      req.user.id
    );
    res.json({ data: account });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    await whatsappAccountService.remove(tenantId, req.params.id, req.user.id);
    res.json({ message: 'WhatsApp account deleted' });
  } catch (err) {
    next(err);
  }
}

export async function activate(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const account = await whatsappAccountService.activate(tenantId, req.params.id, req.user.id);
    res.json({ data: account, message: 'Account activated' });
  } catch (err) {
    next(err);
  }
}

export async function deactivate(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const account = await whatsappAccountService.deactivate(tenantId, req.params.id, req.user.id);
    res.json({ data: account, message: 'Account deactivated' });
  } catch (err) {
    next(err);
  }
}
