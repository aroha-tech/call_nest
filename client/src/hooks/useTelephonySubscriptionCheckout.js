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
 * Razorpay checkout for telephony subscription plans (one-time order or autopay subscription).
 */
export function useTelephonySubscriptionCheckout({ userEmail, onSuccess } = {}) {
  const [payingId, setPayingId] = useState(null);
  const [payError, setPayError] = useState(null);

  const subscribe = useCallback(
    async (plan, { razorpayConfigured = true, autoRenew = true, billingInterval = 'month' } = {}) => {
      setPayError(null);
      if (plan.is_free_trial === 1) {
        setPayError('Free trial is assigned by your platform administrator.');
        return;
      }
      if (plan.is_contact_sales === 1) {
        setPayError('Contact sales for this plan.');
        return;
      }
      if (!razorpayConfigured) {
        setPayError('Razorpay is not configured. Contact your platform administrator.');
        return;
      }
      setPayingId(plan.id);
      try {
        await loadRazorpayScript();
        const orderRes = await tenantTelephonyAPI.createSubscriptionCheckout(plan.id, {
          autoRenew,
          billingInterval,
        });
        const data = orderRes.data?.data;
        if (!data) {
          throw new Error('No checkout session returned');
        }

        const baseOptions = {
          key: data.keyId,
          name: PRODUCT_DISPLAY_NAME,
          description: data.plan?.name || plan.name,
          prefill: { email: userEmail || '' },
          theme: { color: '#4f46e5' },
          modal: { ondismiss: () => setPayingId(null) },
        };

        if (data.checkoutType === 'subscription' && data.subscriptionId) {
          const options = {
            ...baseOptions,
            subscription_id: data.subscriptionId,
            handler: async (response) => {
              try {
                await tenantTelephonyAPI.verifySubscriptionCheckout({
                  razorpay_subscription_id: response.razorpay_subscription_id,
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
          };
          const rzp = new window.Razorpay(options);
          rzp.open();
          return;
        }

        if (!data.orderId) {
          throw new Error('No order returned');
        }

        const options = {
          ...baseOptions,
          amount: data.amount,
          currency: data.currency || 'INR',
          order_id: data.orderId,
          handler: async (response) => {
            try {
              await tenantTelephonyAPI.verifySubscriptionCheckout({
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

  return { subscribe, payingId, payError, setPayError };
}
