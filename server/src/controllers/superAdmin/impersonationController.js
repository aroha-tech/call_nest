import * as impersonationService from '../../services/superAdmin/impersonationService.js';

/**
 * POST /api/admin/impersonate
 * Body: { userId }
 */
export async function start(req, res, next) {
  try {
    const userId = req.body?.userId ?? req.body?.user_id;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    const result = await impersonationService.startImpersonation(req.user.id, Number(userId));
    res.json(result);
  } catch (err) {
    next(err);
  }
}
