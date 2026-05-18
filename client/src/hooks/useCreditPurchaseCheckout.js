import { useCallback, useState } from 'react';
import { tenantTelephonyAPI } from '../services/tenantTelephonyAPI';
import { PRODUCT_DISPLAY_NAME } from '../config/productBrand';
import { buildPaymentResult, PAYMENT_PURCHASE_KIND } from '../utils/paymentResult';
import {
  loadRazorpayScript,
  openRazorpayCheckout,
  razorpayFailureMessage,
} from '../utils/razorpayCheckout';

/**
 * Razorpay checkout for telephony credit purchase packs.
 */
export function useCreditPurchaseCheckout({ userEmail, onSuccess, onResult } = {}) {
  const [payingId, setPayingId] = useState(null);
  const [payError, setPayError] = useState(null);

  const purchase = useCallback(
    async (plan, { razorpayConfigured = true } = {}) => {
      setPayError(null);
      if (!razorpayConfigured) {
        setPayError('Online payments are not configured. Contact your platform administrator.');
        return;
      }
      setPayingId(plan.id);
      const amountPaise = Number(plan.sale_price_paise);
      try {
        await loadRazorpayScript();
        const orderRes = await tenantTelephonyAPI.createPurchaseOrder(plan.id);
        const data = orderRes.data?.data;
        if (!data?.orderId) {
          throw new Error('No order returned');
        }

        const emit = (payload) => onResult?.(payload);

        if (data.devMock) {
          await tenantTelephonyAPI.verifyPurchasePayment({
            razorpay_order_id: data.orderId,
            razorpay_payment_id: `dev_pay_${Date.now()}`,
            razorpay_signature: 'dev_mock',
          });
          emit(
            buildPaymentResult({
              status: 'success',
              plan: data.plan || plan,
              amountPaise: data.amount ?? amountPaise,
              purchaseKind: PAYMENT_PURCHASE_KIND.CREDIT,
            })
          );
          await onSuccess?.();
          setPayingId(null);
          return;
        }

        openRazorpayCheckout({
          options: {
            key: data.keyId,
            amount: data.amount,
            currency: data.currency || 'INR',
            name: PRODUCT_DISPLAY_NAME,
            description: data.plan?.name || plan.name,
            order_id: data.orderId,
            prefill: { email: userEmail || '' },
            theme: { color: '#4f46e5' },
            modal: { ondismiss: () => setPayingId(null) },
          },
          onPaid: async (response) => {
            try {
              await tenantTelephonyAPI.verifyPurchasePayment({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              });
              emit(
                buildPaymentResult({
                  status: 'success',
                  plan: data.plan || plan,
                  amountPaise: data.amount ?? amountPaise,
                  purchaseKind: PAYMENT_PURCHASE_KIND.CREDIT,
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
                  amountPaise: data.amount ?? amountPaise,
                  purchaseKind: PAYMENT_PURCHASE_KIND.CREDIT,
                  errorMessage: msg,
                })
              );
            } finally {
              setPayingId(null);
            }
          },
          onFailed: (response) => {
            setPayingId(null);
            const msg = razorpayFailureMessage(response);
            setPayError(msg);
            emit(
              buildPaymentResult({
                status: 'failed',
                plan,
                amountPaise: data.amount ?? amountPaise,
                purchaseKind: PAYMENT_PURCHASE_KIND.CREDIT,
                errorMessage: msg,
              })
            );
          },
          onDismiss: () => {
            setPayingId(null);
            emit(
              buildPaymentResult({
                status: 'cancelled',
                plan,
                amountPaise: data.amount ?? amountPaise,
                purchaseKind: PAYMENT_PURCHASE_KIND.CREDIT,
              })
            );
          },
        });
      } catch (e) {
        setPayingId(null);
        const msg = e.response?.data?.error || e.message || 'Could not start checkout';
        setPayError(msg);
        onResult?.(
          buildPaymentResult({
            status: 'failed',
            plan,
            amountPaise,
            purchaseKind: PAYMENT_PURCHASE_KIND.CREDIT,
            errorMessage: msg,
          })
        );
      }
    },
    [userEmail, onSuccess, onResult]
  );

  return { purchase, payingId, payError, setPayError };
}
