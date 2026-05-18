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
 * Razorpay checkout for seat & channel add-on plans.
 */
export function useSeatPurchaseCheckout({ userEmail, onSuccess } = {}) {
  const [payingId, setPayingId] = useState(null);
  const [payError, setPayError] = useState(null);

  const purchase = useCallback(
    async (plan, quantity = 1, { razorpayConfigured = true } = {}) => {
      setPayError(null);
      if (!razorpayConfigured) {
        setPayError('Razorpay is not configured. Contact your platform administrator.');
        return;
      }
      const qty = Math.min(50, Math.max(1, Math.floor(Number(quantity) || 1)));
      setPayingId(plan.id);
      try {
        await loadRazorpayScript();
        const orderRes = await tenantTelephonyAPI.createSeatPurchaseOrder(plan.id, qty);
        const data = orderRes.data?.data;
        if (!data?.orderId) {
          throw new Error('No order returned');
        }

        if (data.devMock) {
          await tenantTelephonyAPI.verifySeatPurchasePayment({
            razorpay_order_id: data.orderId,
            razorpay_payment_id: `dev_pay_${Date.now()}`,
            razorpay_signature: 'dev_mock',
          });
          await onSuccess?.();
          setPayingId(null);
          return;
        }

        const options = {
          key: data.keyId,
          amount: data.amount,
          currency: data.currency || 'INR',
          name: PRODUCT_DISPLAY_NAME,
          description: `${data.plan?.name || plan.name}${qty > 1 ? ` × ${qty}` : ''}`,
          order_id: data.orderId,
          handler: async (response) => {
            try {
              await tenantTelephonyAPI.verifySeatPurchasePayment({
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
