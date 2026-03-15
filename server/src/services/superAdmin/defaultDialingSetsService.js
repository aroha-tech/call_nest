import { query } from '../../config/db.js';
import { generateUUID } from '../../utils/uuidHelper.js';

export async function findAll(industryId = undefined, includeInactive = false) {
  let sql = `
    SELECT dds.*, i.name as industry_name
    FROM default_dialing_sets dds
    LEFT JOIN industries i ON dds.industry_id = i.id
    WHERE 1=1
  `;
  const params = [];
  
  if (!includeInactive) {
    sql += ' AND dds.is_active = 1';
  }
  
  // If industryId is explicitly null, filter for "All Industries" (NULL industry_id)
  // If industryId is a string value, filter for that specific industry
  // If industryId is undefined, return all dialing sets
  if (industryId === null) {
    sql += ' AND dds.industry_id IS NULL';
  } else if (industryId !== undefined) {
    sql += ' AND dds.industry_id = ?';
    params.push(industryId);
  }
  
  sql += ' ORDER BY dds.is_default DESC, dds.name ASC';
  
  return query(sql, params);
}

export async function findById(id) {
  const [row] = await query(
    `SELECT dds.*, i.name as industry_name
     FROM default_dialing_sets dds
     LEFT JOIN industries i ON dds.industry_id = i.id
     WHERE dds.id = ?`,
    [id]
  );
  return row || null;
}

export async function create(data, createdBy) {
  const id = generateUUID();
  const {
    industry_id,
    name,
    description = null,
    is_default = 0,
    is_active = 1
  } = data;

  const nameCheckSql = industry_id === null
    ? 'SELECT id FROM default_dialing_sets WHERE industry_id IS NULL AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND is_active = 1'
    : 'SELECT id FROM default_dialing_sets WHERE industry_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND is_active = 1';
  const nameCheckParams = industry_id === null ? [name] : [industry_id, name];
  const [existing] = await query(nameCheckSql, nameCheckParams);
  if (existing) {
    const err = new Error('A dialing set with this name already exists for this industry.');
    err.status = 409;
    throw err;
  }

  if (is_default) {
    // Reset other defaults for the same industry (or all industries if null)
    if (industry_id === null) {
      await query(
        'UPDATE default_dialing_sets SET is_default = 0 WHERE industry_id IS NULL AND is_default = 1'
      );
    } else {
      await query(
        'UPDATE default_dialing_sets SET is_default = 0 WHERE industry_id = ? AND is_default = 1',
        [industry_id]
      );
    }
  }
  
  await query(
    `INSERT INTO default_dialing_sets 
     (id, industry_id, name, description, is_default, is_active, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, industry_id, name, description, is_default, is_active, createdBy, createdBy]
  );
  
  return findById(id);
}

export async function update(id, data, updatedBy) {
  const dialingSet = await findById(id);
  if (!dialingSet) {
    const err = new Error('Default dialing set not found');
    err.status = 404;
    throw err;
  }

  const { industry_id, name, description, is_default, is_active } = data;
  const targetIndustry = industry_id !== undefined ? industry_id : dialingSet.industry_id;

  if (name !== undefined && name !== dialingSet.name) {
    const nameCheckSql = targetIndustry === null
      ? 'SELECT id FROM default_dialing_sets WHERE industry_id IS NULL AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id != ? AND is_active = 1'
      : 'SELECT id FROM default_dialing_sets WHERE industry_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id != ? AND is_active = 1';
    const nameCheckParams = targetIndustry === null ? [name, id] : [targetIndustry, name, id];
    const [existing] = await query(nameCheckSql, nameCheckParams);
    if (existing) {
      const err = new Error('A dialing set with this name already exists for this industry.');
      err.status = 409;
      throw err;
    }
  }

  if (is_default === 1) {
    // Reset other defaults for the same industry (or all industries if null)
    if (targetIndustry === null) {
      await query(
        'UPDATE default_dialing_sets SET is_default = 0 WHERE industry_id IS NULL AND is_default = 1 AND id != ?',
        [id]
      );
    } else {
      await query(
        'UPDATE default_dialing_sets SET is_default = 0 WHERE industry_id = ? AND is_default = 1 AND id != ?',
        [targetIndustry, id]
      );
    }
  }
  
  const updates = [];
  const params = [];
  
  if (industry_id !== undefined) { updates.push('industry_id = ?'); params.push(industry_id); }
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description); }
  if (is_default !== undefined) { updates.push('is_default = ?'); params.push(is_default); }
  if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active); }
  
  updates.push('updated_by = ?');
  params.push(updatedBy);
  params.push(id);
  
  await query(`UPDATE default_dialing_sets SET ${updates.join(', ')} WHERE id = ?`, params);
  
  return findById(id);
}

export async function remove(id) {
  const dialingSet = await findById(id);
  if (!dialingSet) {
    const err = new Error('Default dialing set not found');
    err.status = 404;
    throw err;
  }
  if (dialingSet.is_default === 1) {
    const err = new Error('Cannot delete: this dialing set is marked as default. Set another set as default first.');
    err.status = 409;
    throw err;
  }

  await query('UPDATE default_dialing_sets SET is_active = 0 WHERE id = ?', [id]);
  return { success: true };
}
