/**
 * Shared Razorpay checkout helpers for tenant billing flows.
 */

export function loadRazorpayScript() {
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
 * @param {object} params
 * @param {object} params.options - Razorpay constructor options (handler/modal merged)
 * @param {(response: object) => void | Promise<void>} params.onPaid
 * @param {(response: object) => void} [params.onFailed]
 * @param {() => void} [params.onDismiss]
 */
export function openRazorpayCheckout({ options, onPaid, onFailed, onDismiss }) {
  const { modal: modalOpts, handler: _handler, ...rest } = options;
  let settled = false;

  const rzp = new window.Razorpay({
    ...rest,
    handler: (response) => {
      settled = true;
      void Promise.resolve(onPaid(response)).catch(() => {
        /* caller handles errors */
      });
    },
    modal: {
      ...modalOpts,
      ondismiss: () => {
        modalOpts?.ondismiss?.();
        if (!settled) onDismiss?.();
      },
    },
  });

  rzp.on('payment.failed', (response) => {
    settled = true;
    onFailed?.(response);
  });

  rzp.open();
  return rzp;
}

export function razorpayFailureMessage(response, fallback = 'Payment could not be completed.') {
  const err = response?.error;
  if (err?.description) return String(err.description);
  if (err?.reason) return String(err.reason);
  return fallback;
}
