/**
 * Setup database - Run all SQL schema files in order
 * Usage: node scripts/setupDatabase.js
 * 
 * Note: This script uses mysql2 directly to handle database creation
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import { env } from '../src/config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const schemaDir = join(__dirname, '../schema');

async function runSqlFile(connection, filePath) {
  try {
    let sql = readFileSync(filePath, 'utf8');
    
    // Remove comment lines (lines starting with --)
    sql = sql
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        return trimmed.length > 0 && !trimmed.startsWith('--');
      })
      .join('\n');
    
    // Split by semicolon and filter out empty statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const statement of statements) {
      if (statement) {
        await connection.query(statement);
      }
    }
    console.log(`✅ Executed: ${filePath}`);
    return true;
  } catch (error) {
    console.error(`❌ Error executing ${filePath}:`, error.message);
    if (error.sql) {
      console.error(`SQL: ${error.sql.substring(0, 200)}...`);
    }
    return false;
  }
}

async function setupDatabase() {
  console.log('🚀 Setting up Call Nest database...\n');

  // Create connection without database first (for bootstrap)
  const connectionConfig = {
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    multipleStatements: true,
  };

  let connection;
  try {
    connection = await mysql.createConnection(connectionConfig);
    console.log('✅ Database connection successful\n');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('\nPlease check your .env file and ensure MySQL is running.');
    process.exit(1);
  }

  const files = [
    join(schemaDir, '00_bootstrap.sql'),
    join(schemaDir, 'tenant/tenant.sql'),
    join(schemaDir, 'tenant/01_seed_platform.sql'),
    join(schemaDir, 'user/user.sql'),
    join(schemaDir, 'user/refresh_token.sql'),
  ];

  try {
    for (const filePath of files) {
      const success = await runSqlFile(connection, filePath);
      if (!success) {
        throw new Error(`Failed to execute: ${filePath}`);
      }
    }

    console.log('\n✅ Database setup completed successfully!');
    console.log('\nNext step: Run "node scripts/seedSuperAdmin.js" to create super admin user.');
  } catch (error) {
    console.error('\n❌ Database setup failed:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

setupDatabase();
