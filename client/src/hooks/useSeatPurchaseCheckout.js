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
 * Razorpay checkout for seat & channel add-on plans.
 */
export function useSeatPurchaseCheckout({ userEmail, onSuccess, onResult } = {}) {
  const [payingId, setPayingId] = useState(null);
  const [payError, setPayError] = useState(null);

  const purchase = useCallback(
    async (plan, quantity = 1, { razorpayConfigured = true } = {}) => {
      setPayError(null);
      if (!razorpayConfigured) {
        setPayError('Online payments are not configured. Contact your platform administrator.');
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

        const emit = (payload) => onResult?.(payload);
        const planLabel = `${data.plan?.name || plan.name}${qty > 1 ? ` × ${qty}` : ''}`;

        if (data.devMock) {
          await tenantTelephonyAPI.verifySeatPurchasePayment({
            razorpay_order_id: data.orderId,
            razorpay_payment_id: `dev_pay_${Date.now()}`,
            razorpay_signature: 'dev_mock',
          });
          emit(
            buildPaymentResult({
              status: 'success',
              plan: { ...plan, name: planLabel },
              amountPaise: data.amount,
              purchaseKind: PAYMENT_PURCHASE_KIND.SEAT,
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
            description: planLabel,
            order_id: data.orderId,
            prefill: { email: userEmail || '' },
            theme: { color: '#7c3aed' },
            modal: { ondismiss: () => setPayingId(null) },
          },
          onPaid: async (response) => {
            try {
              await tenantTelephonyAPI.verifySeatPurchasePayment({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              });
              emit(
                buildPaymentResult({
                  status: 'success',
                  plan: { ...plan, name: planLabel },
                  amountPaise: data.amount,
                  purchaseKind: PAYMENT_PURCHASE_KIND.SEAT,
                })
              );
              await onSuccess?.();
            } catch (e) {
              const msg = e.response?.data?.error || e.message || 'Verification failed';
              setPayError(msg);
              emit(
                buildPaymentResult({
                  status: 'failed',
                  plan: { ...plan, name: planLabel },
                  amountPaise: data.amount,
                  purchaseKind: PAYMENT_PURCHASE_KIND.SEAT,
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
                plan: { ...plan, name: planLabel },
                amountPaise: data.amount,
                purchaseKind: PAYMENT_PURCHASE_KIND.SEAT,
                errorMessage: msg,
              })
            );
          },
          onDismiss: () => {
            setPayingId(null);
            emit(
              buildPaymentResult({
                status: 'cancelled',
                plan: { ...plan, name: planLabel },
                amountPaise: data.amount,
                purchaseKind: PAYMENT_PURCHASE_KIND.SEAT,
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
            purchaseKind: PAYMENT_PURCHASE_KIND.SEAT,
            errorMessage: msg,
          })
        );
      }
    },
    [userEmail, onSuccess, onResult]
  );

  return { purchase, payingId, payError, setPayError };
}
