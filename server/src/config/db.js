import mysql from 'mysql2/promise';
import { env } from './env.js';

// Support both DATABASE_URL and individual connection params
const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

/**
 * Execute SQL. Returns: array of rows for SELECT; result object (insertId, affectedRows) for INSERT/UPDATE/DELETE.
 * Do not destructure as array for write operations, e.g. use `const result = await query(...)` not `const [result] = ...`.
 */
export async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

export { pool };
