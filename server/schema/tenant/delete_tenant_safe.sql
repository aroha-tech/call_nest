-- Safely delete a tenant by removing dependent rows first.
-- Only the users table has ON DELETE RESTRICT; others use CASCADE.
-- Run with the desired tenant id (replace 5 with your tenant id).

SET @tenant_id = 5;

-- 1) Delete refresh tokens for all users of this tenant (optional; CASCADE will remove them when users are deleted)
DELETE FROM refresh_tokens WHERE tenant_id = @tenant_id;

-- 2) Remove users of this tenant (this is what blocks tenant delete)
DELETE FROM users WHERE tenant_id = @tenant_id;

-- 3) Now the tenant can be deleted (roles, dispositions, dialing_sets, etc. use ON DELETE CASCADE)
DELETE FROM tenants WHERE id = @tenant_id;
