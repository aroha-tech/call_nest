import Razorpay from 'razorpay';
import { getRazorpayConfig } from './razorpayConfigService.js';

export async function assertRazorpayConfigured() {
  const cfg = await getRazorpayConfig();
  if (!cfg.configured) {
    const err = new Error(
      'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in server .env, save keys under Platform billing → Razorpay, or enable RAZORPAY_DEV_MOCK=1 for local development.'
    );
    err.status = 503;
    throw err;
  }
  return cfg;
}

export async function createRazorpaySdk() {
  const cfg = await assertRazorpayConfigured();
  if (cfg.devMock) {
    const err = new Error('Razorpay API is not used in dev mock checkout mode');
    err.code = 'DEV_MOCK';
    throw err;
  }
  return new Razorpay({
    key_id: cfg.keyId,
    key_secret: cfg.keySecret,
  });
}
