import * as superAdminDialerPhoneNumbersService from '../../services/superAdmin/superAdminDialerPhoneNumbersService.js';

export async function list(req, res, next) {
  try {
    const rawUnalloc = req.query.unallocated_only;
    const unallocated_only =
      rawUnalloc === '1' || String(rawUnalloc ?? '').toLowerCase() === 'true';
    const tenant_id = req.query.tenant_id;
    const rows = await superAdminDialerPhoneNumbersService.listAll({ tenant_id, unallocated_only });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const row = await superAdminDialerPhoneNumbersService.createPlatformRow(req.user?.id ?? null, req.body || {});
    res.status(201).json({ data: row });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const row = await superAdminDialerPhoneNumbersService.updatePlatformRow(
      req.user?.id ?? null,
      req.params.id,
      req.body || {}
    );
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await superAdminDialerPhoneNumbersService.softDeletePlatformRow(req.user?.id ?? null, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
