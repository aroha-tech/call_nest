import React, { useState, useCallback, useEffect } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Alert } from '../components/ui/Alert';
import { Tabs, TabList, Tab, TabPanel } from '../components/ui/Tabs';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from '../components/ui/Table';
import { SearchInput } from '../components/ui/SearchInput';
import { Input } from '../components/ui/Input';
import { Pagination } from '../components/ui/Pagination';
import { platformBillingAPI } from '../services/billingAPI';
import { useDateTimeDisplay } from '../hooks/useDateTimeDisplay';
import pageStyles from '../features/disposition/components/MasterCRUDPage.module.scss';
import listStyles from '../components/admin/adminDataList.module.scss';

const PAGE_SIZE = 20;

function formatInr(paise) {
  const n = Number(paise) / 100;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);
}

export function PlatformBillingPage() {
  const { formatDateTime } = useDateTimeDisplay();
  const [tab, setTab] = useState('payments');
  const [error, setError] = useState(null);
  const [plans, setPlans] = useState([]);

  const [tenantFilter, setTenantFilter] = useState('');

  const [payments, setPayments] = useState([]);
  const [payTotal, setPayTotal] = useState(0);
  const [payPage, setPayPage] = useState(1);
  const [payLimit] = useState(PAGE_SIZE);
  const [paySearch, setPaySearch] = useState('');

  const [subs, setSubs] = useState([]);
  const [subTotal, setSubTotal] = useState(0);
  const [subPage, setSubPage] = useState(1);
  const [subLimit] = useState(PAGE_SIZE);
  const [subSearch, setSubSearch] = useState('');

  const loadPlans = useCallback(async () => {
    try {
      const res = await platformBillingAPI.listPlans();
      setPlans(res.data?.data ?? []);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to load plans');
    }
  }, []);

  const loadPayments = useCallback(async () => {
    setError(null);
    try {
      const tid = tenantFilter.trim() ? Number(tenantFilter) : undefined;
      const res = await platformBillingAPI.listPayments({
        page: payPage,
        limit: payLimit,
        search: paySearch || undefined,
        ...(Number.isFinite(tid) && tid > 0 ? { tenant_id: tid } : {}),
      });
      setPayments(res.data?.data ?? []);
      setPayTotal(res.data?.total ?? 0);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to load payments');
    }
  }, [payPage, payLimit, paySearch, tenantFilter]);

  const loadSubs = useCallback(async () => {
    setError(null);
    try {
      const tid = tenantFilter.trim() ? Number(tenantFilter) : undefined;
      const res = await platformBillingAPI.listSubscriptions({
        page: subPage,
        limit: subLimit,
        search: subSearch || undefined,
        ...(Number.isFinite(tid) && tid > 0 ? { tenant_id: tid } : {}),
      });
      setSubs(res.data?.data ?? []);
      setSubTotal(res.data?.total ?? 0);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to load subscriptions');
    }
  }, [subPage, subLimit, subSearch, tenantFilter]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    if (tab === 'payments') loadPayments();
  }, [tab, loadPayments]);

  useEffect(() => {
    if (tab === 'subscriptions') loadSubs();
  }, [tab, loadSubs]);

  const payTotalPages = Math.max(1, Math.ceil(payTotal / payLimit));
  const subTotalPages = Math.max(1, Math.ceil(subTotal / subLimit));

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Billing (platform)"
        subtitle="Review demo subscription plans and all tenant payments and subscription history."
      />

      {error && (
        <Alert variant="error" className={listStyles.mb}>
          {error}
        </Alert>
      )}

      <Card className={listStyles.mb}>
        <div className={listStyles.tableCardToolbarTop}>
          <div>
            <strong>Demo plans</strong>
            <p className={listStyles.mutedSmall} style={{ margin: '0.25rem 0 0' }}>
              Same catalog tenants see at Settings → Billing. Replace amounts and copy when real pricing is ready.
            </p>
          </div>
        </div>
        <div className={listStyles.planGrid}>
          {plans.map((p) => (
            <Card key={p.id} className={listStyles.planCard}>
              <h3>{p.name}</h3>
              <p className={listStyles.planPrice}>{formatInr(p.amount_paise)}</p>
              <p className={listStyles.mutedSmall}>
                {p.code} · {p.billing_interval}
                {p.tenant_id ? ` · tenant ${p.tenant_id}` : ' · platform'}
              </p>
            </Card>
          ))}
        </div>
      </Card>

      <div className={listStyles.filterBar} style={{ marginBottom: '1rem' }}>
        <div className={listStyles.filterBarFields}>
          <Input
            label="Filter by tenant ID"
            type="number"
            min={1}
            value={tenantFilter}
            onChange={(e) => {
              setTenantFilter(e.target.value);
              setPayPage(1);
              setSubPage(1);
            }}
            placeholder="All tenants"
          />
        </div>
      </div>

      <Tabs>
        <TabList>
          <Tab isActive={tab === 'payments'} onClick={() => setTab('payments')}>
            All payments
          </Tab>
          <Tab isActive={tab === 'subscriptions'} onClick={() => setTab('subscriptions')}>
            All subscriptions
          </Tab>
        </TabList>

        <TabPanel isActive={tab === 'payments'}>
          <div className={listStyles.tableCard}>
            <div className={listStyles.tableCardToolbarTop}>
              <SearchInput
                value={paySearch}
                onSearch={(v) => {
                  setPaySearch(v);
                  setPayPage(1);
                }}
                placeholder="Search tenant, payment id (Enter)"
              />
            </div>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Date</TableHeaderCell>
                  <TableHeaderCell>Tenant</TableHeaderCell>
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
                    <TableCell>
                      {row.tenant_name || '—'}
                      <div className={listStyles.mutedSmall}>#{row.tenant_id}</div>
                    </TableCell>
                    <TableCell>{row.plan_name || '—'}</TableCell>
                    <TableCell>{formatInr(row.amount_paise)}</TableCell>
                    <TableCell>{row.status}</TableCell>
                    <TableCell className={listStyles.mono}>{row.razorpay_payment_id}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!payments.length && <p className={listStyles.empty}>No payments found.</p>}
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
            <div className={listStyles.tableCardToolbarTop}>
              <SearchInput
                value={subSearch}
                onSearch={(v) => {
                  setSubSearch(v);
                  setSubPage(1);
                }}
                placeholder="Search tenant or plan (Enter)"
              />
            </div>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Tenant</TableHeaderCell>
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
                      {row.tenant_name || '—'}
                      <div className={listStyles.mutedSmall}>#{row.tenant_id}</div>
                    </TableCell>
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
            {!subs.length && <p className={listStyles.empty}>No subscriptions found.</p>}
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
    </div>
  );
}
