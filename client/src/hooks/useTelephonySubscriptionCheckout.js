import { useCallback, useState } from 'react';
import { tenantTelephonyAPI } from '../services/tenantTelephonyAPI';
import { PRODUCT_DISPLAY_NAME } from '../config/productBrand';
import { buildPaymentResult, PAYMENT_PURCHASE_KIND } from '../utils/paymentResult';
import {
  loadRazorpayScript,
  openRazorpayCheckout,
  razorpayFailureMessage,
} from '../utils/razorpayCheckout';

function subscriptionAmountPaise(plan, data) {
  if (data?.amount != null) return Number(data.amount);
  return Number(plan?.sale_price_paise);
}

/**
 * Razorpay checkout for telephony subscription plans (one-time order or autopay subscription).
 */
export function useTelephonySubscriptionCheckout({ userEmail, onSuccess, onResult } = {}) {
  const [payingId, setPayingId] = useState(null);
  const [payError, setPayError] = useState(null);

  const runVerifyAndFinish = useCallback(
    async ({ verifyPayload, plan, data, emit }) => {
      try {
        await tenantTelephonyAPI.verifySubscriptionCheckout(verifyPayload);
        emit(
          buildPaymentResult({
            status: 'success',
            plan: data?.plan || plan,
            amountPaise: subscriptionAmountPaise(plan, data),
            purchaseKind: PAYMENT_PURCHASE_KIND.SUBSCRIPTION,
          })
        );
        await onSuccess?.();
      } catch (e) {
        const msg = e.response?.data?.error || e.message || 'Verification failed';
        setPayError(msg);
        emit(
          buildPaymentResult({
            status: 'failed',
            plan,
            amountPaise: subscriptionAmountPaise(plan, data),
            purchaseKind: PAYMENT_PURCHASE_KIND.SUBSCRIPTION,
            errorMessage: msg,
          })
        );
      } finally {
        setPayingId(null);
      }
    },
    [onSuccess]
  );

  const subscribe = useCallback(
    async (plan, { razorpayConfigured = true, autoRenew = false, billingInterval = 'month' } = {}) => {
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
        setPayError('Online payments are not configured. Contact your platform administrator.');
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

        const emit = (payload) => onResult?.(payload);
        const amountPaise = subscriptionAmountPaise(plan, data);

        if (data.devMock && data.orderId) {
          await tenantTelephonyAPI.verifySubscriptionCheckout({
            razorpay_order_id: data.orderId,
            razorpay_payment_id: `dev_pay_${Date.now()}`,
            razorpay_signature: 'dev_mock',
          });
          emit(
            buildPaymentResult({
              status: 'success',
              plan: data.plan || plan,
              amountPaise,
              purchaseKind: PAYMENT_PURCHASE_KIND.SUBSCRIPTION,
            })
          );
          await onSuccess?.();
          setPayingId(null);
          return;
        }

        const baseOptions = {
          key: data.keyId,
          name: PRODUCT_DISPLAY_NAME,
          description: data.plan?.name || plan.name,
          prefill: { email: userEmail || '' },
          theme: { color: '#7c3aed' },
          modal: { ondismiss: () => setPayingId(null) },
        };

        const onFailed = (response) => {
          setPayingId(null);
          const msg = razorpayFailureMessage(response);
          setPayError(msg);
          emit(
            buildPaymentResult({
              status: 'failed',
              plan,
              amountPaise,
              purchaseKind: PAYMENT_PURCHASE_KIND.SUBSCRIPTION,
              errorMessage: msg,
            })
          );
        };

        const onDismiss = () => {
          setPayingId(null);
          emit(
            buildPaymentResult({
              status: 'cancelled',
              plan,
              amountPaise,
              purchaseKind: PAYMENT_PURCHASE_KIND.SUBSCRIPTION,
            })
          );
        };

        if (data.checkoutType === 'subscription' && data.subscriptionId) {
          openRazorpayCheckout({
            options: {
              ...baseOptions,
              subscription_id: data.subscriptionId,
            },
            onPaid: (response) =>
              runVerifyAndFinish({
                verifyPayload: {
                  razorpay_subscription_id: response.razorpay_subscription_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                },
                plan,
                data,
                emit,
              }),
            onFailed,
            onDismiss,
          });
          return;
        }

        if (!data.orderId) {
          throw new Error('No order returned');
        }

        openRazorpayCheckout({
          options: {
            ...baseOptions,
            amount: data.amount,
            currency: data.currency || 'INR',
            order_id: data.orderId,
          },
          onPaid: (response) =>
            runVerifyAndFinish({
              verifyPayload: {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              },
              plan,
              data,
              emit,
            }),
          onFailed,
          onDismiss,
        });
      } catch (e) {
        setPayingId(null);
        const msg = e.response?.data?.error || e.message || 'Could not start checkout';
        setPayError(msg);
        onResult?.(
          buildPaymentResult({
            status: 'failed',
            plan,
            purchaseKind: PAYMENT_PURCHASE_KIND.SUBSCRIPTION,
            errorMessage: msg,
          })
        );
      }
    },
    [userEmail, onSuccess, onResult, runVerifyAndFinish]
  );

  return { subscribe, payingId, payError, setPayError };
}
