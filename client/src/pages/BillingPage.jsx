import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Alert } from '../components/ui/Alert';
import { Tabs, TabList, Tab, TabPanel } from '../components/ui/Tabs';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';
import { billingAPI } from '../services/billingAPI';
import { tenantTelephonyAPI } from '../services/tenantTelephonyAPI';
import {
  TenantTelephonyPlansPanel,
  TENANT_PLANS_SECTIONS,
} from '../components/telephony/TenantTelephonyPlansPanel';
import { useCreditPurchaseCheckout } from '../hooks/useCreditPurchaseCheckout';
import { useSeatPurchaseCheckout } from '../hooks/useSeatPurchaseCheckout';
import { useTelephonySubscriptionCheckout } from '../hooks/useTelephonySubscriptionCheckout';
import { formatPaiseAsInr, ledgerEntryTypeLabel } from '../utils/callCreditsDisplay';
import { BillingTablePreview } from '../components/billing/BillingTablePreview';
import {
  BILLING_PREVIEW_LIMIT,
  BILLING_HISTORY_ROUTES,
  formatBillingInr,
  subscriptionTimeline,
  paymentBadgeMeta,
  subscriptionBadgeMeta,
  cycleBadgeMeta,
} from '../utils/billingDisplay';
import { useAppSelector } from '../app/hooks';
import { selectUser } from '../features/auth/authSelectors';
import { useDateTimeDisplay } from '../hooks/useDateTimeDisplay';
import { useTenant } from '../context/TenantContext';
import { PRODUCT_DISPLAY_NAME } from '../config/productBrand';
import { downloadPaymentInvoiceHtml } from '../utils/billingInvoiceDownload';
import { PaymentResultModal } from '../components/billing/PaymentResultModal';
import styles from './BillingPage.module.scss';
import listStyles from '../components/admin/adminDataList.module.scss';
export function BillingPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAppSelector(selectUser);
  const { tenantSlug } = useTenant();
  const { formatDateTime } = useDateTimeDisplay();
  const tabParam = searchParams.get('tab');
  const tab = ['plans', 'payments', 'subscriptions', 'wallet'].includes(tabParam) ? tabParam : 'plans';
  const setTab = (next) => {
    setSearchParams(next === 'plans' ? {} : { tab: next }, { replace: true });
  };
  const [plansSection, setPlansSection] = useState(TENANT_PLANS_SECTIONS.subscriptions);
  const [config, setConfig] = useState(null);
  const [plansView, setPlansView] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [current, setCurrent] = useState(null);
  const [recentPayments, setRecentPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [payments, setPayments] = useState([]);
  const [payTotal, setPayTotal] = useState(0);
  const [payLoading, setPayLoading] = useState(false);

  const [subs, setSubs] = useState([]);
  const [subTotal, setSubTotal] = useState(0);
  const [subLoading, setSubLoading] = useState(false);

  const [walletRows, setWalletRows] = useState([]);
  const [walletTotal, setWalletTotal] = useState(0);
  const [walletLoading, setWalletLoading] = useState(false);

  const [paymentResult, setPaymentResult] = useState(null);

  const loadCore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfg, purchaseCfg, cur, recentRes] = await Promise.all([
        billingAPI.getConfig(),
        tenantTelephonyAPI.getPurchaseConfig().catch(() => ({ data: { data: {} } })),
        billingAPI.getCurrent(),
        billingAPI.listPayments({ page: 1, limit: 15 }),
      ]);
      const purchase = purchaseCfg.data?.data ?? {};
      setConfig({
        ...(cfg.data?.data ?? {}),
        razorpayConfigured:
          purchase.razorpayConfigured ?? cfg.data?.data?.razorpayConfigured ?? false,
      });
      setPlansView(purchase);
      setCurrent(cur.data?.data ?? null);
      setRecentPayments(recentRes.data?.data ?? []);

      if (purchase.creditPurchaseEligible ?? purchase.eligible) {
        try {
          const w = await tenantTelephonyAPI.getPurchaseWallet();
          setWallet(w.data?.data?.wallet ?? null);
        } catch {
          setWallet(null);
        }
      } else {
        setWallet(null);
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to load billing');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPayments = useCallback(async () => {
    setPayLoading(true);
    try {
      const res = await billingAPI.listPayments({
        page: 1,
        limit: BILLING_PREVIEW_LIMIT,
      });
      setPayments(res.data?.data ?? []);
      setPayTotal(res.data?.total ?? 0);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to load payments');
    } finally {
      setPayLoading(false);
    }
  }, []);

  const loadSubs = useCallback(async () => {
    setSubLoading(true);
    try {
      const res = await billingAPI.listSubscriptions({
        page: 1,
        limit: BILLING_PREVIEW_LIMIT,
      });
      setSubs(res.data?.data ?? []);
      setSubTotal(res.data?.total ?? 0);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to load subscriptions');
    } finally {
      setSubLoading(false);
    }
  }, []);

  const loadWallet = useCallback(async () => {
    setWalletLoading(true);
    try {
      const res = await tenantTelephonyAPI.listLedger({
        page: 1,
        limit: BILLING_PREVIEW_LIMIT,
      });
      const payload = res.data?.data ?? {};
      setWalletRows(payload.rows ?? []);
      setWalletTotal(payload.total ?? 0);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to load wallet history');
    } finally {
      setWalletLoading(false);
    }
  }, []);

  const handlePurchaseSuccess = useCallback(async () => {
    await loadCore();
    await Promise.all([loadPayments(), loadSubs(), loadWallet()]);
  }, [loadCore, loadPayments, loadSubs, loadWallet]);

  const {
    purchase: purchaseCredits,
    payingId: creditPayingId,
    payError,
    setPayError,
  } = useCreditPurchaseCheckout({
    userEmail: user?.email,
    onSuccess: handlePurchaseSuccess,
    onResult: (result) => setPaymentResult(result),
  });

  const {
    purchase: purchaseSeats,
    payingId: seatPayingId,
    payError: seatPayError,
    setPayError: setSeatPayError,
  } = useSeatPurchaseCheckout({
    userEmail: user?.email,
    onSuccess: handlePurchaseSuccess,
    onResult: (result) => setPaymentResult(result),
  });

  const {
    subscribe: subscribePlan,
    payingId: subscribingId,
    payError: subscribePayError,
    setPayError: setSubscribePayError,
  } = useTelephonySubscriptionCheckout({
    userEmail: user?.email,
    onSuccess: handlePurchaseSuccess,
    onResult: (result) => setPaymentResult(result),
  });

  const clearPaymentErrors = useCallback(() => {
    setPayError(null);
    setSeatPayError(null);
    setSubscribePayError(null);
  }, [setPayError, setSeatPayError, setSubscribePayError]);

  const closePaymentResult = useCallback(() => setPaymentResult(null), []);

  const viewPaymentHistory = useCallback(() => {
    closePaymentResult();
    clearPaymentErrors();
    navigate(BILLING_HISTORY_ROUTES.payments);
  }, [closePaymentResult, clearPaymentErrors, navigate]);

  const goToDashboard = useCallback(() => {
    closePaymentResult();
    navigate('/');
  }, [closePaymentResult, navigate]);

  const onPurchaseCredits = useCallback(
    (plan) => purchaseCredits(plan, { razorpayConfigured: config?.razorpayConfigured }),
    [purchaseCredits, config?.razorpayConfigured]
  );

  const onPurchaseSeats = useCallback(
    (plan, quantity) =>
      purchaseSeats(plan, quantity, { razorpayConfigured: config?.razorpayConfigured }),
    [purchaseSeats, config?.razorpayConfigured]
  );

  const onSubscribePlan = useCallback(
    (plan, { billingInterval = 'month' } = {}) =>
      subscribePlan(plan, {
        razorpayConfigured: config?.razorpayConfigured,
        autoRenew: false,
        billingInterval,
      }),
    [subscribePlan, config?.razorpayConfigured]
  );

  useEffect(() => {
    loadCore();
    void loadPayments();
    void loadSubs();
    void loadWallet();
  }, [loadCore, loadPayments, loadSubs, loadWallet]);

  useEffect(() => {
    if (plansSection === TENANT_PLANS_SECTIONS.credits) {
      clearPaymentErrors();
    }
  }, [plansSection, clearPaymentErrors]);

  const timeline = useMemo(() => subscriptionTimeline(current), [current]);
  const cycleBadge = useMemo(() => cycleBadgeMeta(timeline, current?.status), [timeline, current?.status]);

  const lastCapturedPayment = useMemo(
    () => recentPayments.find((p) => String(p.status).toLowerCase() === 'captured'),
    [recentPayments]
  );

  const recentCapturedCount = useMemo(
    () => recentPayments.filter((p) => String(p.status).toLowerCase() === 'captured').length,
    [recentPayments]
  );
  const recentFailedCount = useMemo(
    () => recentPayments.filter((p) => String(p.status).toLowerCase() === 'failed').length,
    [recentPayments]
  );

  const paymentHealthHint = useMemo(() => {
    if (!recentPayments.length) return 'No charges in the latest batch.';
    if (recentFailedCount > 0) {
      return `${recentFailedCount} failed payment${recentFailedCount > 1 ? 's' : ''} in recent activity — review below.`;
    }
    if (recentCapturedCount > 0) {
      return `${recentCapturedCount} successful payment${recentCapturedCount > 1 ? 's' : ''} recorded recently.`;
    }
    return 'Review payment status in history.';
  }, [recentPayments.length, recentFailedCount, recentCapturedCount]);

  const onDownloadInvoice = (row) => {
    downloadPaymentInvoiceHtml({
      payment: row,
      customerEmail: user?.email,
      workspaceLabel: tenantSlug || undefined,
      productName: PRODUCT_DISPLAY_NAME,
    });
  };


  return (
    <div className={styles.page}>
      <PageHeader
        title="Plans & billing"
        subtitle="Subscribe to credit-based or unlimited plans, top up call credits, buy seat add-ons, and pay securely online."
      />

      {error && (
        <Alert variant="error" className={styles.mb}>
          {error}
        </Alert>
      )}
      {(payError || seatPayError || subscribePayError) && (
        <Alert variant="error" display="inline" className={styles.mb}>
          {payError || seatPayError || subscribePayError}
        </Alert>
      )}

      {loading ? (
        <Skeleton height={320} />
      ) : (
        <>
          {!config?.razorpayConfigured && (
            <div className={styles.configBanner}>
              Online payments are not available yet. Contact your platform administrator if checkout does not work.
              For local dev, set RAZORPAY_DEV_MOCK=1 in server .env and restart the API.
            </div>
          )}

          <section className={`${styles.hero} ${!current ? styles.heroLight : ''}`}>
            <div className={styles.heroGlow} aria-hidden />
            <div className={styles.heroInner}>
              <div className={styles.heroMain}>
                <span className={styles.heroEyebrow}>
                  {plansView?.callBillingMode === 'credit' ? 'Call credit wallet' : 'Workspace billing'}
                </span>
                {plansView?.callBillingMode === 'credit' && wallet ? (
                  <>
                    <h2 className={styles.heroTitle}>Call credits</h2>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                      <Badge variant="success" size="md">
                        {formatPaiseAsInr(wallet.balance_paise)} available
                      </Badge>
                      {current ? (
                        <Badge variant="info" size="md">
                          {current.plan_name}
                        </Badge>
                      ) : null}
                    </div>
                    <p className={listStyles.mutedSmall} style={{ margin: '12px 0 0', maxWidth: '520px', lineHeight: 1.55 }}>
                      Top up your wallet with credit packs below. Credits are used for connected outbound minutes on
                      platform calling.
                    </p>
                    <div className={styles.heroActions}>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          clearPaymentErrors();
                          setTab('plans');
                          setPlansSection(TENANT_PLANS_SECTIONS.credits);
                        }}
                      >
                        Buy credits
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={styles.heroLinkBtn}
                        onClick={() => navigate(BILLING_HISTORY_ROUTES.wallet)}
                      >
                        Wallet history
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={styles.heroLinkBtn}
                        onClick={() => navigate(BILLING_HISTORY_ROUTES.payments)}
                      >
                        Payment history
                      </Button>
                    </div>
                  </>
                ) : current ? (
                  <>
                    <h2 className={styles.heroTitle}>{current.plan_name}</h2>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                      <Badge variant={cycleBadge.variant} size="md">
                        {cycleBadge.label}
                      </Badge>
                      {timeline?.urgency === 'soon' && !timeline.expired && (
                        <Badge variant="warning" size="md">
                          {timeline.daysLeft} days left
                        </Badge>
                      )}
                    </div>
                    <div className={styles.heroMetaRow}>
                      <div className={styles.heroMetaItem}>
                        <span className={styles.heroMetaLabel}>Current period</span>
                        <span className={styles.heroMetaValue}>
                          {formatDateTime(current.current_period_start)} — {formatDateTime(current.current_period_end)}
                        </span>
                      </div>
                      <div className={styles.heroMetaItem}>
                        <span className={styles.heroMetaLabel}>Renews on</span>
                        <span className={styles.heroMetaValue}>{formatDateTime(current.current_period_end)}</span>
                      </div>
                      {current.razorpay_payment_id && (
                        <div className={styles.heroMetaItem}>
                          <span className={styles.heroMetaLabel}>Last charge id</span>
                          <span className={`${styles.heroMetaValue} ${styles.mono}`}>{current.razorpay_payment_id}</span>
                        </div>
                      )}
                    </div>
                    <div className={styles.heroActions}>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          setTab('plans');
                          setPlansSection(TENANT_PLANS_SECTIONS.subscriptions);
                        }}
                      >
                        Change plan
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={styles.heroLinkBtn}
                        onClick={() => setTab('payments')}
                      >
                        Invoices & payments
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className={styles.heroTitle}>Call credit packs</h2>
                    <p className={listStyles.mutedSmall} style={{ margin: 0, maxWidth: '520px', lineHeight: 1.55 }}>
                      {plansView?.creditPurchaseReason ??
                        plansView?.eligibilityReason ??
                        'Buy call credits when your workspace uses credit billing and platform calling.'}
                    </p>
                    <div className={styles.heroActions}>
                      <Button type="button" variant="primary" size="sm" onClick={() => setTab('plans')}>
                        View packs
                      </Button>
                    </div>
                  </>
                )}
              </div>

              <div className={styles.ringWrap}>
                <span className={styles.ringLabel}>Billing cycle</span>
                <div
                  className={styles.ring}
                  style={{ '--pct': timeline && !timeline.expired ? timeline.pct : current ? 100 : 12 }}
                >
                  <div className={styles.ringInner}>
                    <span className={styles.ringDays}>{current ? (timeline?.expired ? '0' : timeline?.daysLeft ?? '—') : '—'}</span>
                    <span className={styles.ringUnit}>{current ? 'days left' : 'pick a plan'}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className={styles.statsRow}>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Renewal runway</span>
              <span className={styles.statValue}>
                {current
                  ? timeline?.expired
                    ? 'Overdue'
                    : `${timeline?.daysLeft ?? '—'} days`
                  : '—'}
              </span>
              <span className={styles.statHint}>
                {current
                  ? timeline?.expired
                    ? 'Renew your plan to restore uninterrupted access.'
                    : `Cycle ends ${formatDateTime(current.current_period_end)}.`
                  : 'Subscribe to see countdown to your next renewal.'}
              </span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Last payment</span>
              <span className={styles.statValue}>
                {lastCapturedPayment ? formatBillingInr(lastCapturedPayment.amount_paise) : '—'}
              </span>
              <span className={styles.statHint}>
                {lastCapturedPayment
                  ? `${formatDateTime(lastCapturedPayment.created_at)} · ${lastCapturedPayment.plan_name || 'Plan'}`
                  : 'Successful charges appear here after checkout.'}
              </span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Recent payment activity</span>
              <span
                className={`${styles.statValue} ${recentFailedCount > 0 ? styles.statBad : recentCapturedCount > 0 ? styles.statOk : ''}`}
              >
                {recentFailedCount > 0 ? 'Needs attention' : recentCapturedCount > 0 ? 'Healthy' : 'Quiet'}
              </span>
              <span className={`${styles.statHint} ${recentFailedCount > 0 ? styles.statBad : ''}`}>
                {paymentHealthHint}
              </span>
            </div>
          </div>

          <div className={styles.tabsCard}>
            <Tabs>
              <div className={styles.tabToolbar}>
                <TabList>
                  <Tab isActive={tab === 'plans'} onClick={() => setTab('plans')}>
                    Plans & upgrade
                  </Tab>
                  <Tab isActive={tab === 'payments'} onClick={() => setTab('payments')}>
                    Payments & invoices
                  </Tab>
                  <Tab isActive={tab === 'subscriptions'} onClick={() => setTab('subscriptions')}>
                    Subscription history
                  </Tab>
                  <Tab isActive={tab === 'wallet'} onClick={() => setTab('wallet')}>
                    Wallet history
                  </Tab>
                </TabList>
              </div>

              <TabPanel isActive={tab === 'plans'}>
                <div className={styles.planSection}>
                  <TenantTelephonyPlansPanel
                    callBillingMode={plansView?.callBillingMode || 'credit'}
                    tenantBillingPlans={plansView?.tenantBillingPlans ?? []}
                    assignedBillingPlanId={
                      plansView?.assignedBillingPlanId ?? plansView?.assignedBillingPlan?.id
                    }
                    subscriptionAssignedPlanId={plansView?.subscriptionAssignedPlanId}
                    telephonySubscription={plansView?.telephonySubscription}
                    activeSection={plansSection}
                    onSectionChange={setPlansSection}
                    creditPurchasePlans={plansView?.creditPurchasePlans ?? plansView?.plans ?? []}
                    creditPurchaseEligible={
                      plansView?.creditPurchaseEligible ?? plansView?.eligible
                    }
                    creditPurchaseReason={
                      plansView?.creditPurchaseReason ?? plansView?.eligibilityReason
                    }
                    razorpayConfigured={config?.razorpayConfigured}
                    subscriptionCyclesVisible={plansView?.subscriptionCyclesVisible}
                    creditPayingId={creditPayingId}
                    seatPayingId={seatPayingId}
                    subscribePayingId={subscribingId}
                    onPurchase={onPurchaseCredits}
                    onPurchaseSeats={onPurchaseSeats}
                    seatPurchasePlans={plansView?.seatPurchasePlans ?? []}
                    seatPurchaseEligible={plansView?.seatPurchaseEligible}
                    seatPurchaseReason={plansView?.seatPurchaseReason}
                    seatLimits={plansView?.seatLimits}
                    onSubscribe={onSubscribePlan}
                  />
                </div>
              </TabPanel>

              <TabPanel isActive={tab === 'payments'}>
                <div className={styles.historyPreviewSection}>
                  <BillingTablePreview
                    total={payTotal}
                    previewLimit={BILLING_PREVIEW_LIMIT}
                    viewAllTo={BILLING_HISTORY_ROUTES.payments}
                    viewAllLabel="View all payments"
                    loading={payLoading}
                    isEmpty={!payLoading && payments.length === 0}
                    emptyIcon="💳"
                    emptyTitle="No payments yet"
                    emptyDescription="Successful payments appear here after checkout."
                    skeletonColumns={6}
                  >
                    <Table variant="adminList">
                      <TableHead>
                        <TableRow>
                          <TableHeaderCell>Date</TableHeaderCell>
                          <TableHeaderCell>Plan</TableHeaderCell>
                          <TableHeaderCell>Amount</TableHeaderCell>
                          <TableHeaderCell>Status</TableHeaderCell>
                          <TableHeaderCell>Payment id</TableHeaderCell>
                          <TableHeaderCell align="right">Invoice</TableHeaderCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {payments.map((row) => {
                          const pm = paymentBadgeMeta(row.status);
                          return (
                            <TableRow key={row.id}>
                              <TableCell>{formatDateTime(row.created_at)}</TableCell>
                              <TableCell>{row.plan_name || '—'}</TableCell>
                              <TableCell>{formatBillingInr(row.amount_paise)}</TableCell>
                              <TableCell>
                                <Badge variant={pm.variant} size="sm">
                                  {pm.label}
                                </Badge>
                              </TableCell>
                              <TableCell className={styles.mono}>{row.razorpay_payment_id}</TableCell>
                              <TableCell align="right" className={styles.actionCell}>
                                <Button type="button" variant="secondary" size="sm" onClick={() => onDownloadInvoice(row)}>
                                  Download
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </BillingTablePreview>
                </div>
              </TabPanel>

              <TabPanel isActive={tab === 'subscriptions'}>
                <div className={styles.historyPreviewSection}>
                  <BillingTablePreview
                    total={subTotal}
                    previewLimit={BILLING_PREVIEW_LIMIT}
                    viewAllTo={BILLING_HISTORY_ROUTES.subscriptions}
                    viewAllLabel="View all subscriptions"
                    loading={subLoading}
                    isEmpty={!subLoading && subs.length === 0}
                    emptyIcon="📅"
                    emptyTitle="No subscription history yet"
                    emptyDescription="Past and current plan periods from telephony checkout."
                    skeletonColumns={4}
                  >
                    <Table variant="adminList">
                      <TableHead>
                        <TableRow>
                          <TableHeaderCell>Period</TableHeaderCell>
                          <TableHeaderCell>Plan</TableHeaderCell>
                          <TableHeaderCell>Status</TableHeaderCell>
                          <TableHeaderCell>Payment id</TableHeaderCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {subs.map((row) => {
                          const sm = subscriptionBadgeMeta(row.status);
                          return (
                            <TableRow key={row.id}>
                              <TableCell>
                                {formatDateTime(row.current_period_start)} — {formatDateTime(row.current_period_end)}
                              </TableCell>
                              <TableCell>{row.plan_name}</TableCell>
                              <TableCell>
                                <Badge variant={sm.variant} size="sm">
                                  {sm.label}
                                </Badge>
                              </TableCell>
                              <TableCell className={styles.mono}>{row.razorpay_payment_id || '—'}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </BillingTablePreview>
                </div>
              </TabPanel>

              <TabPanel isActive={tab === 'wallet'}>
                <div className={styles.historyPreviewSection}>
                  <BillingTablePreview
                    total={walletTotal}
                    previewLimit={BILLING_PREVIEW_LIMIT}
                    viewAllTo={BILLING_HISTORY_ROUTES.wallet}
                    viewAllLabel="View all wallet transactions"
                    loading={walletLoading}
                    isEmpty={!walletLoading && walletRows.length === 0}
                    emptyIcon="💰"
                    emptyTitle="No wallet transactions yet"
                    emptyDescription="Top-ups, plan credits, and call debits appear here."
                    skeletonColumns={6}
                  >
                    <Table variant="adminList">
                      <TableHead>
                        <TableRow>
                          <TableHeaderCell>When</TableHeaderCell>
                          <TableHeaderCell>Type</TableHeaderCell>
                          <TableHeaderCell>Amount</TableHeaderCell>
                          <TableHeaderCell>Balance after</TableHeaderCell>
                          <TableHeaderCell>Call</TableHeaderCell>
                          <TableHeaderCell>Note</TableHeaderCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {walletRows.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell>{formatDateTime(row.created_at)}</TableCell>
                            <TableCell>{ledgerEntryTypeLabel(row.entry_type)}</TableCell>
                            <TableCell>{formatPaiseAsInr(row.amount_paise)}</TableCell>
                            <TableCell>{formatPaiseAsInr(row.balance_after_paise)}</TableCell>
                            <TableCell>{row.call_attempt_id || '—'}</TableCell>
                            <TableCell>{row.note || '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </BillingTablePreview>
                </div>
              </TabPanel>
            </Tabs>
          </div>

        </>
      )}

      <PaymentResultModal
        isOpen={!!paymentResult}
        onClose={closePaymentResult}
        status={paymentResult?.status}
        planName={paymentResult?.planName}
        amountPaise={paymentResult?.amountPaise}
        purchaseKind={paymentResult?.purchaseKind}
        errorMessage={paymentResult?.errorMessage}
        onViewHistory={viewPaymentHistory}
        onGoDashboard={goToDashboard}
        onTryAgain={closePaymentResult}
      />
    </div>
  );
}
