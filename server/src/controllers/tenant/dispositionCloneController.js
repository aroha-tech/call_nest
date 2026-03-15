import * as dispositionCloneService from '../../services/tenant/dispositionCloneService.js';

/**
 * Clone all defaults for an industry to tenant
 * POST /api/tenant/dispositions/clone
 */
export async function cloneFromIndustry(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const { industry_id, include_dialing_sets = true } = req.body;
    
    if (!industry_id) {
      return res.status(400).json({ error: 'industry_id is required' });
    }
    
    const result = await dispositionCloneService.cloneDefaultsToTenant(
      tenantId,
      industry_id,
      req.user.id,
      include_dialing_sets
    );
    
    res.status(201).json({
      message: 'Defaults cloned successfully',
      data: result
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Clone a specific default dialing set to tenant
 * POST /api/tenant/dialing-sets/clone
 */
export async function cloneDialingSet(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const { default_dialing_set_id } = req.body;
    
    if (!default_dialing_set_id) {
      return res.status(400).json({ error: 'default_dialing_set_id is required' });
    }
    
    const result = await dispositionCloneService.cloneDialingSet(
      tenantId,
      default_dialing_set_id,
      req.user.id
    );
    
    res.status(201).json({
      message: 'Dialing set cloned successfully',
      data: result
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Clone a specific default disposition to tenant
 * POST /api/tenant/dispositions/clone-single
 */
export async function cloneDisposition(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const { default_disposition_id } = req.body;
    
    if (!default_disposition_id) {
      return res.status(400).json({ error: 'default_disposition_id is required' });
    }
    
    const result = await dispositionCloneService.cloneDisposition(
      tenantId,
      default_disposition_id,
      req.user.id
    );
    
    res.status(201).json({
      message: 'Disposition cloned successfully',
      data: result
    });
  } catch (err) {
    next(err);
  }
}
