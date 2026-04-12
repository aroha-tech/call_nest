/**
 * One-shot: apply 058_tenant_meetings.sql using app DB config.
 * Usage: node scripts/applyMigration058.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { query } from '../src/config/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const file = join(__dirname, '../schema/migrations/058_tenant_meetings.sql');
let sql = readFileSync(file, 'utf8');
sql = sql.replace(/--[^\r\n]*/g, '').trim();
const parts = sql
  .split(';')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

for (const st of parts) {
  await query(`${st};`);
  console.log('OK:', st.slice(0, 60).replace(/\s+/g, ' '), '...');
}
console.log('Migration 058 applied.');
process.exit(0);
