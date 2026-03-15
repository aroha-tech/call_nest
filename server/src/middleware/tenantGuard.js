/**
 * Tenant guard middleware
 * Ensures tenant_id is available in req.tenantId for all requests
 * Super admin (tenant_id=1) can access all tenants
 */

export function tenantGuard(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Extract tenant_id from user context
  req.tenantId = req.user.tenantId;
  
  // Super admin can access all tenants (tenant_id = 1)
  // For other roles, tenantId is their company's tenant_id
  next();
}

/**
 * Optional: Middleware to allow super admin only
 */
export function superAdminOnly(req, res, next) {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  next();
}
