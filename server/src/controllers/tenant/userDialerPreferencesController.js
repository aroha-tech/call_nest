import * as userDialerPreferencesService from '../../services/tenant/userDialerPreferencesService.js';

export async function get(req, res, next) {
  try {
    const data = await userDialerPreferencesService.getForUser(req.user.id, req.tenant.id);
    if (!data) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
}

export async function update(req, res, next) {
  try {
    const data = await userDialerPreferencesService.updateForUser(req.user.id, req.tenant.id, req.body ?? {});
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
}
