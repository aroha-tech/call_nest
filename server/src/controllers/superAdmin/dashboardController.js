import * as dashboardService from '../../services/superAdmin/dashboardService.js';

export async function getStats(req, res, next) {
  try {
    const stats = await dashboardService.getStats();
    res.json({ data: stats });
  } catch (err) {
    next(err);
  }
}
