/**
 * Seed super admin user
 * Run: node scripts/seedSuperAdmin.js
 */

import bcrypt from 'bcryptjs';
import { query } from '../src/config/db.js';
import { env } from '../src/config/env.js';

async function seedSuperAdmin() {
  try {
    console.log('Seeding super admin...');
    
    // Check if super admin already exists
    const [existing] = await query(
      'SELECT id FROM users WHERE tenant_id = 1 AND role = ? AND deleted_at IS NULL',
      ['super_admin']
    );
    
    if (existing) {
      console.log('Super admin already exists. Skipping seed.');
      return;
    }
    
    // Ensure platform tenant exists
    const [tenant] = await query('SELECT id FROM tenants WHERE id = 1');
    if (!tenant) {
      console.log('Platform tenant (id=1) does not exist. Please run tenant/01_seed_platform.sql first.');
      process.exit(1);
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(env.superAdmin.password, 10);
    
    // Insert super admin
    await query(
      `INSERT INTO users (tenant_id, email, password_hash, name, role, is_enabled)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        1, // platform tenant
        env.superAdmin.email,
        passwordHash,
        'Super Admin',
        'super_admin',
        1, // enabled
      ]
    );
    
    console.log('Super admin seeded successfully!');
    console.log(`Email: ${env.superAdmin.email}`);
    console.log(`Password: ${env.superAdmin.password}`);
    console.log('⚠️  Please change the password after first login!');
  } catch (error) {
    console.error('Error seeding super admin:', error);
    process.exit(1);
  }
}

seedSuperAdmin();
