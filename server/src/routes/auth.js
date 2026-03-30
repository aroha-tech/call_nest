import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import { tenantAuthMiddleware, authMiddleware, verifyTokenVersion } from '../middleware/auth.js';
import { query } from '../config/db.js';

const router = Router();

// Public routes (subdomain is resolved by tenantResolver, but no auth required)
router.post('/register', authController.register);
router.get('/tenant-slug-status', authController.tenantSlugStatus);
router.post('/login', authController.login);
router.post('/refresh', authController.refresh);

// Authenticated: update own profile (name, password); works for tenant users and platform admins
router.patch('/me', authMiddleware, verifyTokenVersion, authController.updateMe);

// Public: Get industries for registration dropdown
router.get('/industries', async (req, res, next) => {
  try {
    const industries = await query(
      'SELECT id, name, code FROM industries WHERE is_active = 1 ORDER BY name ASC'
    );
    res.json({ data: industries });
  } catch (err) {
    next(err);
  }
});

// Tenant-scoped protected routes
// - Require valid JWT
// - Enforce tenant from subdomain (req.tenant.id) instead of trusting frontend
router.post('/register-agent', tenantAuthMiddleware, authController.registerAgent);
router.post('/logout', tenantAuthMiddleware, authController.logout);

export default router;
