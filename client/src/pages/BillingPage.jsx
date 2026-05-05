import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Alert } from '../components/ui/Alert';
import { Tabs, TabList, Tab, TabPanel } from '../components/ui/Tabs';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from '../components/ui/Table';
import { SearchInput } from '../components/ui/SearchInput';
import { Pagination } from '../components/ui/Pagination';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';
import { billingAPI } from '../services/billingAPI';
import { useAppSelector } from '../app/hooks';
import { selectUser } from '../features/auth/authSelectors';
import { useDateTimeDisplay } from '../hooks/useDateTimeDisplay';
import { useTenant } from '../context/TenantContext';
import { downloadPaymentInvoiceHtml } from '../utils/billingInvoiceDownload';
import styles from './BillingPage.module.scss';
import listStyles from '../components/admin/adminDataList.module.scss';

const PAGE_SIZE = 20;

function formatInr(paise) {
  const n = Number(paise) / 100;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);
}

function parseDbDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  const iso = str.includes('T') ? str : str.replace(' ', 'T');
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Progress through billing period, days until renewal, urgency for messaging. */
function subscriptionTimeline(current) {
  if (!current) return null;
  const start = parseDbDate(current.current_period_start);
  const end = parseDbDate(current.current_period_end);
  const now = Date.now();
  if (!start || !end) return null;
  const totalMs = end.getTime() - start.getTime();
  const elapsedMs = now - start.getTime();
  let pct = 0;
  if (totalMs > 0) {
    pct = Math.round(Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100)));
  }
  const msDay = 86400000;
  const rawDays = Math.ceil((end.getTime() - now) / msDay);
  const expired = end.getTime() < now;
  const daysLeft = expired ? 0 : Math.max(0, rawDays);
  let urgency = 'ok';
  if (expired) urgency = 'critical';
  else if (rawDays <= 7) urgency = 'soon';
  else if (rawDays <= 14) urgency = 'notice';

  return {
    pct: expired ? 100 : pct,
    daysLeft,
    expired,
    urgency,
    end,
    start,
  };
}

function paymentBadgeMeta(status) {
  const s = String(status || '').toLowerCase();
  switch (s) {
    case 'captured':
      return { label: 'Payment received', variant: 'success' };
    case 'failed':
      return { label: 'Payment failed', variant: 'danger' };
    case 'refunded':
      return { label: 'Refunded', variant: 'warning' };
    case 'authorized':
      return { label: 'Authorized', variant: 'info' };
    case 'created':
      return { label: 'Pending', variant: 'muted' };
    default:
      return { label: s ? s.replace(/_/g, ' ') : 'Unknown', variant: 'default' };
  }
}

function subscriptionBadgeMeta(status) {
  const s = String(status || '').toLowerCase();
  switch (s) {
    case 'active':
      return { label: 'Active', variant: 'success' };
    case 'expired':
      return { label: 'Expired', variant: 'muted' };
    case 'cancelled':
      return { label: 'Cancelled', variant: 'warning' };
    case 'pending':
      return { label: 'Pending', variant: 'info' };
    default:
      return { label: s ? s.replace(/_/g, ' ') : '—', variant: 'default' };
  }
}

function cycleBadgeMeta(timeline, subStatus) {
  if (String(subStatus || '').toLowerCase() !== 'active') {
    return { label: String(subStatus || 'inactive'), variant: 'muted' };
  }
  if (!timeline) return { label: 'Active', variant: 'success' };
  if (timeline.expired) return { label: 'Renewal overdue', variant: 'danger' };
  if (timeline.urgency === 'soon') return { label: 'Renews soon', variant: 'warning' };
  if (timeline.urgency === 'notice') return { label: 'Active', variant: 'success' };
  return { label: 'Active', variant: 'success' };
}

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

export function BillingPage() {
  const user = useAppSelector(selectUser);
  const { tenantSlug } = useTenant();
  const { formatDateTime } = useDateTimeDisplay();
  const [tab, setTab] = useState('plans');
  const [config, setConfig] = useState(null);
  const [plans, setPlans] = useState([]);
  const [current, setCurrent] = useState(null);
  const [recentPayments, setRecentPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [payError, setPayError] = useState(null);
  const [payingId, setPayingId] = useState(null);

  const [payments, setPayments] = useState([]);
  const [payTotal, setPayTotal] = useState(0);
  const [payPage, setPayPage] = useState(1);
  const [payLimit] = useState(PAGE_SIZE);
  const [paySearch, setPaySearch] = useState('');

  const [subs, setSubs] = useState([]);
  const [subTotal, setSubTotal] = useState(0);
  const [subPage, setSubPage] = useState(1);
  const [subLimit] = useState(PAGE_SIZE);

  const loadCore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfg, pl, cur, recentRes] = await Promise.all([
        billingAPI.getConfig(),
        billingAPI.listPlans(),
        billingAPI.getCurrent(),
        billingAPI.listPayments({ page: 1, limit: 15 }),
      ]);
      setConfig(cfg.data?.data ?? null);
      setPlans(pl.data?.data ?? []);
      setCurrent(cur.data?.data ?? null);
      setRecentPayments(recentRes.data?.data ?? []);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to load billing');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPayments = useCallback(async () => {
    try {
      const res = await billingAPI.listPayments({
        page: payPage,
        limit: payLimit,
        search: paySearch || undefined,
      });
      setPayments(res.data?.data ?? []);
      setPayTotal(res.data?.total ?? 0);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to load payments');
    }
  }, [payPage, payLimit, paySearch]);

  const loadSubs = useCallback(async () => {
    try {
      const res = await billingAPI.listSubscriptions({ page: subPage, limit: subLimit });
      setSubs(res.data?.data ?? []);
      setSubTotal(res.data?.total ?? 0);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to load subscriptions');
    }
  }, [subPage, subLimit]);

  useEffect(() => {
    loadCore();
  }, [loadCore]);

  useEffect(() => {
    if (tab === 'payments') loadPayments();
  }, [tab, loadPayments]);

  useEffect(() => {
    if (tab === 'subscriptions') loadSubs();
  }, [tab, loadSubs]);

  const timeline = useMemo(() => subscriptionTimeline(current), [current]);
  const cycleBadge = useMemo(() => cycleBadgeMeta(timeline, current?.status), [timeline, current?.status]);

  const featuredPlanIndex = useMemo(() => {
    if (!plans.length) return -1;
    if (plans.length === 1) return 0;
    return Math.min(1, Math.floor(plans.length / 2));
  }, [plans]);

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

  const onSubscribe = async (plan) => {
    setPayError(null);
    if (!config?.razorpayConfigured) {
      setPayError('Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the API server.');
      return;
    }
    setPayingId(plan.id);
    try {
      await loadRazorpayScript();
      const orderRes = await billingAPI.createOrder(plan.id);
      const data = orderRes.data?.data;
      if (!data?.orderId) {
        throw new Error('No order returned');
      }
      const options = {
        key: data.keyId,
        amount: data.amount,
        currency: data.currency || 'INR',
        name: 'Call Nest',
        description: data.plan?.name || plan.name,
        order_id: data.orderId,
        handler: async (response) => {
          try {
            await billingAPI.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            await loadCore();
            setTab('payments');
            await loadPayments();
            await loadSubs();
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
          email: user?.email || '',
        },
        theme: { color: '#4f46e5' },
      };
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (e) {
      setPayingId(null);
      setPayError(e.response?.data?.error || e.message || 'Could not start checkout');
    }
  };

  const onDownloadInvoice = (row) => {
    downloadPaymentInvoiceHtml({
      payment: row,
      customerEmail: user?.email,
      workspaceLabel: tenantSlug || undefined,
      productName: 'Call Nest',
    });
  };

  const payTotalPages = Math.max(1, Math.ceil(payTotal / payLimit));
  const subTotalPages = Math.max(1, Math.ceil(subTotal / subLimit));

  return (
    <div className={styles.page}>
      <PageHeader
        title="Plans & billing"
        subtitle="Subscription, payment health, invoices, and Razorpay checkout — everything your workspace needs to stay current."
      />

      {error && (
        <Alert variant="error" className={styles.mb}>
          {error}
        </Alert>
      )}
      {payError && (
        <Alert variant="error" className={styles.mb}>
          {payError}
        </Alert>
      )}

      {loading ? (
        <Skeleton height={320} />
      ) : (
        <>
          {!config?.razorpayConfigured && (
            <div className={styles.configBanner}>
              Payments are disabled until Razorpay keys are configured on the server. You can still review plans and
              history.
            </div>
          )}

          <section className={`${styles.hero} ${!current ? styles.heroLight : ''}`}>
            <div className={styles.heroGlow} aria-hidden />
            <div className={styles.heroInner}>
              <div className={styles.heroMain}>
                <span className={styles.heroEyebrow}>Workspace subscription</span>
                {current ? (
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
                      <Button type="button" variant="primary" size="sm" onClick={() => setTab('plans')}>
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
                    <h2 className={styles.heroTitle}>Unlock the full workspace</h2>
                    <p className={listStyles.mutedSmall} style={{ margin: 0, maxWidth: '520px', lineHeight: 1.55 }}>
                      You do not have an active subscription. Pick a plan to enable billing-period tracking, invoices,
                      and payment status — same checkout flow your team uses in production.
                    </p>
                    <div className={styles.heroActions}>
                      <Button type="button" variant="primary" size="sm" onClick={() => setTab('plans')}>
                        Compare plans
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
                {lastCapturedPayment ? formatInr(lastCapturedPayment.amount_paise) : '—'}
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
                </TabList>
              </div>

              <TabPanel isActive={tab === 'plans'}>
                <div className={styles.planSection}>
                  <div className={styles.planGrid}>
                    {plans.map((p, idx) => {
                      const isFeatured = idx === featuredPlanIndex && plans.length > 1;
                      const isCurrent = current?.plan_id === p.id;
                      const cardClass = [
                        styles.planCard,
                        isFeatured && styles.planCardFeatured,
                        isCurrent && styles.planCardCurrent,
                      ]
                        .filter(Boolean)
                        .join(' ');
                      return (
                        <Card key={p.id} className={cardClass}>
                          {(isFeatured || isCurrent) && (
                            <div className={styles.planBadge}>
                              {isCurrent ? (
                                <Badge variant="success" size="sm">
                                  Current
                                </Badge>
                              ) : (
                                <Badge variant="primary" size="sm">
                                  Popular
                                </Badge>
                              )}
                            </div>
                          )}
                          <h3>{p.name}</h3>
                          <p className={styles.planPrice}>{formatInr(p.amount_paise)}</p>
                          <p className={styles.planInterval}>
                            {p.billing_interval === 'year'
                              ? `Billed every ${p.interval_count || 1} year(s)`
                              : `Billed every ${p.interval_count || 1} month(s)`}
                          </p>
                          <p className={styles.planDesc}>{p.description}</p>
                          <Button
                            variant="primary"
                            fullWidth
                            disabled={payingId != null || !config?.razorpayConfigured || isCurrent}
                            onClick={() => onSubscribe(p)}
                          >
                            {isCurrent
                              ? 'Active plan'
                              : payingId === p.id
                                ? 'Opening checkout…'
                                : 'Pay with Razorpay'}
                          </Button>
                        </Card>
                      );
                    })}
                  </div>
                  {!plans.length && <p className={styles.empty}>No plans available for this workspace.</p>}
                </div>
              </TabPanel>

              <TabPanel isActive={tab === 'payments'}>
                <div className={styles.tableCard}>
                  <div className={styles.tableToolbar}>
                    <SearchInput
                      value={paySearch}
                      onSearch={(v) => {
                        setPaySearch(v);
                        setPayPage(1);
                      }}
                      placeholder="Search by payment or order id (Enter)"
                    />
                  </div>
                  <div className={styles.tableScroll}>
                    <Table>
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
                              <TableCell>{formatInr(row.amount_paise)}</TableCell>
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
                  </div>
                  {!payments.length && <p className={styles.empty}>No payments yet.</p>}
                  <div className={listStyles.tableCardFooterPagination}>
                    <Pagination
                      page={payPage}
                      totalPages={payTotalPages}
                      total={payTotal}
                      limit={payLimit}
                      onPageChange={setPayPage}
                      hidePageSize
                    />
                  </div>
                </div>
              </TabPanel>

              <TabPanel isActive={tab === 'subscriptions'}>
                <div className={styles.tableCard}>
                  <div className={styles.tableScroll}>
                    <Table>
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
                  </div>
                  {!subs.length && <p className={styles.empty}>No subscription history yet.</p>}
                  <div className={listStyles.tableCardFooterPagination}>
                    <Pagination
                      page={subPage}
                      totalPages={subTotalPages}
                      total={subTotal}
                      limit={subLimit}
                      onPageChange={setSubPage}
                      hidePageSize
                    />
                  </div>
                </div>
              </TabPanel>
            </Tabs>
          </div>

        </>
      )}
    </div>
  );
}
