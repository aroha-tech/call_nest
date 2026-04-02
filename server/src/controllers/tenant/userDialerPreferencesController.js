import * as userDialerPreferencesService from '../../services/tenant/userDialerPreferencesService.js';

function hasPermission(req, code) {
  return Boolean(req.user?.isPlatformAdmin) || (req.user?.permissions || []).includes(code);
}

/** Personal default call script: agents with scripts.self only, not tenant settings managers. */
function canSetPersonalCallScriptDefault(req) {
  return hasPermission(req, 'scripts.self') && !hasPermission(req, 'settings.manage');
}

/** Personal default dialing set: not users who manage tenant dispositions/dialing sets. */
function canSetPersonalDialingSetDefault(req) {
  return !hasPermission(req, 'dispositions.manage');
}

export async function get(req, res, next) {
  try {
    const data = await userDialerPreferencesService.getForUser(req.user.id, req.tenant.id);
    if (!data) {
      return res.status(404).json({ error: 'User not found' });
    }
    const payload = { ...data };
    if (!canSetPersonalCallScriptDefault(req)) {
      payload.default_call_script_id = null;
      payload.default_call_script_name = null;
    }
    if (!canSetPersonalDialingSetDefault(req)) {
      payload.default_dialing_set_id = null;
      payload.default_dialing_set_name = null;
    }
    return res.json({ data: payload });
  } catch (err) {
    return next(err);
  }
}

export async function update(req, res, next) {
  try {
    const body = req.body ?? {};
    if (body.default_call_script_id !== undefined && !canSetPersonalCallScriptDefault(req)) {
      return res.status(403).json({
        error: 'Only agents can set a personal default call script. Administrators do not use this setting.',
      });
    }
    if (body.default_dialing_set_id !== undefined && !canSetPersonalDialingSetDefault(req)) {
      return res.status(403).json({
        error: 'Only agents can set a personal default dialing set. Use Disposition Settings to manage sets.',
      });
    }
    const data = await userDialerPreferencesService.updateForUser(req.user.id, req.tenant.id, body);
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
}
