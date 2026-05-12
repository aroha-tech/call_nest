import { Router } from 'express';
import { platformAuthMiddleware } from '../../middleware/auth.js';
import * as tenantTelephonyController from '../../controllers/superAdmin/tenantTelephonyController.js';

const router = Router();
router.use(platformAuthMiddleware);

// Platform-wide telephony defaults (rate, BYO fee, min balance).
router.get('/platform-settings', tenantTelephonyController.getPlatformSettings);
router.patch('/platform-settings', tenantTelephonyController.updatePlatformSettings);

// Per-tenant billing config + manual credit operations.
router.get('/:tenant_id/billing', tenantTelephonyController.getTenantBilling);
router.patch('/:tenant_id/billing', tenantTelephonyController.updateTenantBilling);
router.get('/:tenant_id/usage', tenantTelephonyController.getUsage);
router.get('/:tenant_id/credits/ledger', tenantTelephonyController.getLedger);
router.post('/:tenant_id/credits/topup', tenantTelephonyController.topupCredits);
router.post('/:tenant_id/credits/debit-adjust', tenantTelephonyController.debitCredits);

// BYO provider accounts (Exotel) management on behalf of a tenant.
router.get('/:tenant_id/accounts', tenantTelephonyController.listAccounts);
router.post('/:tenant_id/accounts', tenantTelephonyController.createAccount);
router.get('/:tenant_id/accounts/:account_id', tenantTelephonyController.getAccount);
router.patch('/:tenant_id/accounts/:account_id', tenantTelephonyController.updateAccount);
router.post('/:tenant_id/accounts/:account_id/rotate-webhook-token', tenantTelephonyController.rotateAccountToken);
router.delete('/:tenant_id/accounts/:account_id', tenantTelephonyController.deleteAccount);

export default router;
