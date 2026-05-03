import React, { useState, useCallback, useEffect } from 'react';
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
import pageStyles from '../features/disposition/components/MasterCRUDPage.module.scss';
import listStyles from '../components/admin/adminDataList.module.scss';

const PAGE_SIZE = 20;

function formatInr(paise) {
  const n = Number(paise) / 100;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);
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
  const { formatDateTime } = useDateTimeDisplay();
  const [tab, setTab] = useState('plans');
  const [config, setConfig] = useState(null);
  const [plans, setPlans] = useState([]);
  const [current, setCurrent] = useState(null);
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
      const [cfg, pl, cur] = await Promise.all([
        billingAPI.getConfig(),
        billingAPI.listPlans(),
        billingAPI.getCurrent(),
      ]);
      setConfig(cfg.data?.data ?? null);
      setPlans(pl.data?.data ?? []);
      setCurrent(cur.data?.data ?? null);
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
            setTab('subscriptions');
            await loadSubs();
            await loadPayments();
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

  const payTotalPages = Math.max(1, Math.ceil(payTotal / payLimit));
  const subTotalPages = Math.max(1, Math.ceil(subTotal / subLimit));

  return (
    <div className={pageStyles.page}>
      <PageHeader title="Billing" subtitle="Demo plans, payment history, and subscription history (Razorpay)." />

      {error && (
        <Alert variant="error" className={listStyles.mb}>
          {error}
        </Alert>
      )}
      {payError && (
        <Alert variant="error" className={listStyles.mb}>
          {payError}
        </Alert>
      )}

      {loading ? (
        <Skeleton height={200} />
      ) : (
        <>
          <Card className={listStyles.mb}>
            <div className={listStyles.tableCardToolbarTop}>
              <strong>Current subscription</strong>
            </div>
            <div style={{ padding: '0 1rem 1rem' }}>
              {current ? (
                <p>
                  <Badge variant="success">{current.status}</Badge>{' '}
                  <strong>{current.plan_name}</strong> — until {formatDateTime(current.current_period_end)}
                </p>
              ) : (
                <p className={listStyles.muted}>No active subscription. Choose a demo plan below.</p>
              )}
            </div>
          </Card>

          <Tabs>
            <TabList>
              <Tab isActive={tab === 'plans'} onClick={() => setTab('plans')}>
                Plans
              </Tab>
              <Tab isActive={tab === 'payments'} onClick={() => setTab('payments')}>
                Payment history
              </Tab>
              <Tab isActive={tab === 'subscriptions'} onClick={() => setTab('subscriptions')}>
                Subscription history
              </Tab>
            </TabList>

            <TabPanel isActive={tab === 'plans'}>
              <div className={listStyles.tableCard}>
                <div className={listStyles.planGrid}>
                  {plans.map((p) => (
                    <Card key={p.id} className={listStyles.planCard}>
                      <h3>{p.name}</h3>
                      <p className={listStyles.planPrice}>{formatInr(p.amount_paise)}</p>
                      <p className={listStyles.mutedSmall}>
                        {p.billing_interval === 'year'
                          ? `Billed every ${p.interval_count || 1} year(s)`
                          : `Billed every ${p.interval_count || 1} month(s)`}
                      </p>
                      <p className={listStyles.planDesc}>{p.description}</p>
                      <Button
                        variant="primary"
                        disabled={payingId != null || !config?.razorpayConfigured}
                        onClick={() => onSubscribe(p)}
                      >
                        {payingId === p.id ? 'Opening…' : 'Pay with Razorpay'}
                      </Button>
                    </Card>
                  ))}
                </div>
                {!plans.length && <p className={listStyles.muted}>No plans available.</p>}
              </div>
            </TabPanel>

            <TabPanel isActive={tab === 'payments'}>
              <div className={listStyles.tableCard}>
                <div className={listStyles.tableCardToolbarTop}>
                  <SearchInput
                    value={paySearch}
                    onSearch={(v) => {
                      setPaySearch(v);
                      setPayPage(1);
                    }}
                    placeholder="Search payment or order id (Enter)"
                  />
                </div>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Date</TableHeaderCell>
                      <TableHeaderCell>Plan</TableHeaderCell>
                      <TableHeaderCell>Amount</TableHeaderCell>
                      <TableHeaderCell>Status</TableHeaderCell>
                      <TableHeaderCell>Payment id</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {payments.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{formatDateTime(row.created_at)}</TableCell>
                        <TableCell>{row.plan_name || '—'}</TableCell>
                        <TableCell>{formatInr(row.amount_paise)}</TableCell>
                        <TableCell>{row.status}</TableCell>
                        <TableCell className={listStyles.mono}>{row.razorpay_payment_id}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {!payments.length && <p className={listStyles.empty}>No payments yet.</p>}
                <Pagination
                  page={payPage}
                  totalPages={payTotalPages}
                  total={payTotal}
                  limit={payLimit}
                  onPageChange={setPayPage}
                  hidePageSize
                />
              </div>
            </TabPanel>

            <TabPanel isActive={tab === 'subscriptions'}>
              <div className={listStyles.tableCard}>
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
                    {subs.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          {formatDateTime(row.current_period_start)} — {formatDateTime(row.current_period_end)}
                        </TableCell>
                        <TableCell>{row.plan_name}</TableCell>
                        <TableCell>{row.status}</TableCell>
                        <TableCell className={listStyles.mono}>{row.razorpay_payment_id || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {!subs.length && <p className={listStyles.empty}>No subscription history yet.</p>}
                <Pagination
                  page={subPage}
                  totalPages={subTotalPages}
                  total={subTotal}
                  limit={subLimit}
                  onPageChange={setSubPage}
                  hidePageSize
                />
              </div>
            </TabPanel>
          </Tabs>
        </>
      )}
    </div>
  );
}
