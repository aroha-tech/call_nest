import * as industryFieldDefinitionsService from '../../services/superAdmin/industryFieldDefinitionsService.js';
import * as industriesService from '../../services/superAdmin/industriesService.js';

async function assertIndustryExists(industryId) {
  const ind = await industriesService.findById(industryId);
  if (!ind) {
    const err = new Error('Industry not found');
    err.status = 404;
    throw err;
  }
  return ind;
}

export async function listByIndustry(req, res, next) {
  try {
    const { industryId } = req.params;
    await assertIndustryExists(industryId);
    const data = await industryFieldDefinitionsService.listByIndustryId(industryId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const { industryId } = req.params;
    await assertIndustryExists(industryId);
    const row = await industryFieldDefinitionsService.create(industryId, req.body || {}, req.user.id);
    res.status(201).json({ data: row });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const row = await industryFieldDefinitionsService.update(req.params.fieldId, req.body || {}, req.user.id);
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await industryFieldDefinitionsService.remove(req.params.fieldId);
    res.json({ message: 'Field definition deleted' });
  } catch (err) {
    next(err);
  }
}
