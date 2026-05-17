import { useCallback, useState } from 'react';
import { tenantTelephonyAPI } from '../services/tenantTelephonyAPI';
import { PRODUCT_DISPLAY_NAME } from '../config/productBrand';

function loadRazorpayScript() {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.Razorpay) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Razorpay'));
    document.body.appendChild(s);
  });
}

/**
 * Razorpay checkout for telephony credit purchase packs.
 */
export function useCreditPurchaseCheckout({ userEmail, onSuccess } = {}) {
  const [payingId, setPayingId] = useState(null);
  const [payError, setPayError] = useState(null);

  const purchase = useCallback(
    async (plan, { razorpayConfigured = true } = {}) => {
      setPayError(null);
      if (!razorpayConfigured) {
        setPayError('Razorpay is not configured. Contact your platform administrator.');
        return;
      }
      setPayingId(plan.id);
      try {
        await loadRazorpayScript();
        const orderRes = await tenantTelephonyAPI.createPurchaseOrder(plan.id);
        const data = orderRes.data?.data;
        if (!data?.orderId) {
          throw new Error('No order returned');
        }
        const options = {
          key: data.keyId,
          amount: data.amount,
          currency: data.currency || 'INR',
          name: PRODUCT_DISPLAY_NAME,
          description: data.plan?.name || plan.name,
          order_id: data.orderId,
          handler: async (response) => {
            try {
              await tenantTelephonyAPI.verifyPurchasePayment({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              });
              await onSuccess?.();
            } catch (e) {
              setPayError(e.response?.data?.error || e.message || 'Verification failed');
            } finally {
              setPayingId(null);
            }
          },
          modal: {
            ondismiss: () => setPayingId(null),
          },
          prefill: {
            email: userEmail || '',
          },
          theme: { color: '#4f46e5' },
        };
        const rzp = new window.Razorpay(options);
        rzp.open();
      } catch (e) {
        setPayingId(null);
        setPayError(e.response?.data?.error || e.message || 'Could not start checkout');
      }
    },
    [userEmail, onSuccess]
  );

  return { purchase, payingId, payError, setPayError };
}
