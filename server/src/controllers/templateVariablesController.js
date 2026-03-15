import * as templateVariablesService from '../services/templateVariablesService.js';
import { extractVariables } from '../services/templateEngine/variableDetector.js';
import * as variableValidator from '../services/templateEngine/variableValidator.js';

/**
 * GET /api/template-variables
 * Returns active variables grouped by module.
 * Available to any authenticated user (tenant or platform).
 */
export async function getGrouped(req, res, next) {
  try {
    const grouped = await templateVariablesService.getActiveGroupedByModule();
    res.json(grouped);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/template-variables/preview-sample
 * Returns { variable_key: sample_value } for preview. Merge with client defaults as needed.
 */
export async function getPreviewSample(req, res, next) {
  try {
    const data = await templateVariablesService.getPreviewSampleData();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/template-variables/validate
 * Body: { text: string } or { variables: string[] }
 * Returns { valid: boolean, invalidVariables?: string[], error?: string }
 */
export async function validate(req, res, next) {
  try {
    const { text, variables: variableList } = req.body || {};
    let keys = variableList;
    if (keys == null && typeof text === 'string') {
      keys = extractVariables(text);
    }
    if (!Array.isArray(keys) || keys.length === 0) {
      return res.json({ valid: true });
    }
    const result = await variableValidator.validateVariables(keys);
    if (result.valid) {
      return res.json({ valid: true });
    }
    return res.status(400).json({
      valid: false,
      invalidVariables: result.invalidVariables,
      error: result.error,
    });
  } catch (err) {
    next(err);
  }
}
