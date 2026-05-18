import React, { useMemo } from 'react';
import { Modal, ModalFooter } from '../ui/Modal';
import { Button } from '../ui/Button';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import { PAYMENT_PURCHASE_KIND } from '../../utils/paymentResult';
import styles from './PaymentResultModal.module.scss';

function formatInr(paise) {
  const n = Number(paise) / 100;
  if (!Number.isFinite(n)) return null;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);
}

function copyForKind(purchaseKind, status) {
  const kind = purchaseKind || PAYMENT_PURCHASE_KIND.CREDIT;
  if (status === 'success') {
    if (kind === PAYMENT_PURCHASE_KIND.SEAT) {
      return 'Your seat add-ons are now active on this workspace.';
    }
    if (kind === PAYMENT_PURCHASE_KIND.SUBSCRIPTION) {
      return 'Your subscription is active. Included benefits apply from this payment.';
    }
    return 'Call credits have been added to your wallet. Thank you for your payment.';
  }
  if (status === 'cancelled') {
    return 'Checkout was closed before the payment finished. No charge was made.';
  }
  if (kind === PAYMENT_PURCHASE_KIND.SEAT) {
    return 'We could not confirm your seat purchase. You can try again or contact support if you were charged.';
  }
  if (kind === PAYMENT_PURCHASE_KIND.SUBSCRIPTION) {
    return 'We could not activate your subscription. You can try again or contact support if you were charged.';
  }
  return 'We could not confirm your payment. You can try again or contact support if you were charged.';
}

/**
 * Shown after Razorpay checkout completes, fails, or is dismissed.
 */
export function PaymentResultModal({
  isOpen,
  onClose,
  status = 'success',
  planName,
  amountPaise,
  purchaseKind,
  errorMessage,
  onViewHistory,
  onGoDashboard,
  onTryAgain,
}) {
  const isSuccess = status === 'success';
  const isCancelled = status === 'cancelled';
  const amountLabel = formatInr(amountPaise);

  const { title, subtitle, iconName, iconClass } = useMemo(() => {
    if (isSuccess) {
      return {
        title: 'Payment successful',
        subtitle: 'Thank you — your payment was received.',
        iconName: 'check_circle',
        iconClass: styles.success,
      };
    }
    if (isCancelled) {
      return {
        title: 'Payment cancelled',
        subtitle: 'You closed checkout before paying.',
        iconName: 'cancel',
        iconClass: styles.cancelled,
      };
    }
    return {
      title: 'Payment unsuccessful',
      subtitle: errorMessage || 'Something went wrong while processing your payment.',
      iconName: 'error',
      iconClass: styles.failed,
    };
  }, [isSuccess, isCancelled, errorMessage]);

  const lead = copyForKind(purchaseKind, status);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      size="sm"
      closeOnOverlay
      closeOnEscape
      headerIcon={
        <div className={`${styles.heroIcon} ${iconClass}`} aria-hidden>
          <MaterialSymbol name={iconName} size="md" />
        </div>
      }
      footer={
        <ModalFooter className={styles.footerRow}>
          <Button type="button" variant="ghost" onClick={onClose}>
            {isSuccess ? 'Done' : 'Close'}
          </Button>
          {!isSuccess && onTryAgain ? (
            <Button type="button" variant="secondary" onClick={onTryAgain}>
              Try again
            </Button>
          ) : null}
          {onViewHistory ? (
            <Button
              type="button"
              variant={isSuccess ? 'secondary' : 'ghost'}
              onClick={onViewHistory}
            >
              View payment history
            </Button>
          ) : null}
          {onGoDashboard ? (
            <Button type="button" variant="primary" onClick={onGoDashboard}>
              Go to dashboard
            </Button>
          ) : null}
        </ModalFooter>
      }
    >
      <div className={styles.body}>
        <p className={styles.lead}>{lead}</p>
        {(planName || amountLabel) && isSuccess ? (
          <div className={styles.detail}>
            {planName ? (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Plan</span>
                <span className={styles.detailValue}>{planName}</span>
              </div>
            ) : null}
            {amountLabel ? (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Amount paid</span>
                <span className={styles.detailValue}>{amountLabel}</span>
              </div>
            ) : null}
          </div>
        ) : null}
        {!isSuccess && errorMessage && !isCancelled ? (
          <p className={styles.detail}>{errorMessage}</p>
        ) : null}
      </div>
    </Modal>
  );
}
