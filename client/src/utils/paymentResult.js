/** Purchase context for post-checkout modals. */
export const PAYMENT_PURCHASE_KIND = {
  CREDIT: 'credit_pack',
  SEAT: 'seat_addon',
  SUBSCRIPTION: 'subscription',
};

export function buildPaymentResult({
  status,
  plan,
  amountPaise,
  purchaseKind,
  errorMessage,
}) {
  return {
    status,
    planName: plan?.name ?? null,
    amountPaise: amountPaise != null ? Number(amountPaise) : null,
    purchaseKind,
    errorMessage: errorMessage ? String(errorMessage) : null,
  };
}
