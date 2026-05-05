import * as phoneInsightService from '../../services/tenant/phoneInsightService.js';

/**
 * GET /api/tenant/phone-insight?phone=...&default_country=IN
 * Query `e164` is accepted as an alias for `phone`.
 */
export async function get(req, res, next) {
  try {
    const q = req.query || {};
    const phone = q.phone ?? q.e164 ?? '';
    const default_country = q.default_country ?? q.defaultCountry;
    const data = phoneInsightService.analyzePhoneNumber(phone, default_country);
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
}
