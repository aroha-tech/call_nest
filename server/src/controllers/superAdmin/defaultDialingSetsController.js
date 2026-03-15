import * as defaultDialingSetsService from '../../services/superAdmin/defaultDialingSetsService.js';

export async function getAll(req, res, next) {
  try {
    const includeInactive = req.query.include_inactive === 'true';
    // Parse industry_id: "null" string means All Industries, undefined means no filter
    let industryId;
    if (req.query.industry_id === 'null') {
      industryId = null; // Explicit null for "All Industries"
    } else if (req.query.industry_id) {
      industryId = req.query.industry_id;
    } else {
      industryId = undefined; // No filter
    }
    const dialingSets = await defaultDialingSetsService.findAll(industryId, includeInactive);
    res.json({ data: dialingSets });
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const dialingSet = await defaultDialingSetsService.findById(req.params.id);
    if (!dialingSet) {
      return res.status(404).json({ error: 'Default dialing set not found' });
    }
    res.json({ data: dialingSet });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const { industry_id, name, description, is_default, is_active } = req.body;
    
    // industry_id can be null for "All Industries"
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    
    const dialingSet = await defaultDialingSetsService.create(
      { industry_id: industry_id ?? null, name, description, is_default, is_active },
      req.user.id
    );
    
    res.status(201).json({ data: dialingSet });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const { industry_id, name, description, is_default, is_active } = req.body;
    
    const dialingSet = await defaultDialingSetsService.update(
      req.params.id,
      { industry_id, name, description, is_default, is_active },
      req.user.id
    );
    
    res.json({ data: dialingSet });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await defaultDialingSetsService.remove(req.params.id);
    res.json({ message: 'Default dialing set deactivated successfully' });
  } catch (err) {
    next(err);
  }
}
