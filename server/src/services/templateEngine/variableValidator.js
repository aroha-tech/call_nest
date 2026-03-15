/**
 * Validate that variable keys exist in template_variables table.
 */

import * as templateVariablesService from '../templateVariablesService.js';

/**
 * Validate that every key in variableList exists as an active template variable.
 *
 * @param {string[]} variableList - Variable keys to validate
 * @returns {Promise<{ valid: boolean, invalidVariables?: string[], error?: string }>}
 */
export async function validateVariables(variableList) {
  if (!Array.isArray(variableList) || variableList.length === 0) {
    return { valid: true };
  }

  const validKeys = await templateVariablesService.getActiveVariableKeys();
  const validSet = new Set(validKeys);
  const invalidVariables = variableList.filter((key) => !validSet.has(key));

  if (invalidVariables.length > 0) {
    return {
      valid: false,
      invalidVariables,
      error: `Invalid template variable(s): ${invalidVariables.join(', ')}`,
    };
  }

  return { valid: true };
}
