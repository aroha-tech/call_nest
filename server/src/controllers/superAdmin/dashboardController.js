import * as dashboardService from '../../services/superAdmin/dashboardService.js';
import { parseInclusiveDateRange } from '../../utils/dateRangeQuery.js';

export async function getStats(req, res, next) {
  try {
    const hasFrom = req.query.from != null && String(req.query.from).trim() !== '';
    const hasTo = req.query.to != null && String(req.query.to).trim() !== '';
    if (hasFrom !== hasTo) {
      return res.status(400).json({ error: 'Provide both from and to as YYYY-MM-DD, or omit both for all-time totals' });
    }
    const range = hasFrom ? parseInclusiveDateRange(req.query.from, req.query.to) : null;
    if (hasFrom && !range) {
      return res.status(400).json({ error: 'Invalid date range: from and to must be YYYY-MM-DD with from <= to' });
    }
    const stats = await dashboardService.getStats(range);
    res.json({ data: stats });
  } catch (err) {
    next(err);
  }
}
