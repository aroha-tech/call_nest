import * as tenantsService from '../../services/superAdmin/tenantsService.js';

export async function getAll(req, res, next) {
  try {
    const {
      search = '',
      include_disabled,
      page = '1',
      limit = '20',
      industry_id,
      min_users,
      max_users,
    } = req.query;

    const result = await tenantsService.findAll({
      search,
      includeDisabled: include_disabled === 'true',
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      industryId: industry_id,
      minUsers: min_users,
      maxUsers: max_users,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const tenant = await tenantsService.findById(req.params.id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    res.json({ data: tenant });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const {
      name,
      slug,
      industry_id,
      is_enabled,
      admin_email,
      admin_password,
      admin_name,
      whatsapp_send_mode,
      whatsapp_module_enabled,
      whatsapp_automation_enabled,
      email_communication_enabled,
      email_module_enabled,
      email_automation_enabled,
      theme,
    } = req.body;
    if (!name || !slug) {
      return res.status(400).json({ error: 'name and slug are required' });
    }
    if (!admin_email || !admin_password) {
      return res.status(400).json({ error: 'admin_email and admin_password are required (first admin for this tenant)' });
    }
    const tenant = await tenantsService.create(
      {
        name,
        slug,
        industry_id,
        is_enabled,
        admin_email: admin_email.trim(),
        admin_password,
        admin_name: admin_name || null,
        whatsapp_send_mode,
        whatsapp_module_enabled,
        whatsapp_automation_enabled,
        email_communication_enabled,
        email_module_enabled,
        email_automation_enabled,
        theme,
      },
      req.user?.id
    );
    res.status(201).json({ data: tenant });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const {
      name,
      slug,
      industry_id,
      is_enabled,
      whatsapp_send_mode,
      whatsapp_module_enabled,
      whatsapp_automation_enabled,
      email_communication_enabled,
      email_module_enabled,
      email_automation_enabled,
      theme,
    } = req.body;
    const tenant = await tenantsService.update(req.params.id, {
      name,
      slug,
      industry_id,
      is_enabled,
      whatsapp_send_mode,
      whatsapp_module_enabled,
      whatsapp_automation_enabled,
      email_communication_enabled,
      email_module_enabled,
      email_automation_enabled,
      theme,
    });
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    res.json({ data: tenant });
  } catch (err) {
    next(err);
  }
}
