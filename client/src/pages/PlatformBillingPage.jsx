import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { Alert } from '../components/ui/Alert';
import { Tabs, TabList, Tab, TabPanel } from '../components/ui/Tabs';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from '../components/ui/Table';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { platformBillingAPI } from '../services/billingAPI';
import { PlatformRazorpaySettingsForm } from '../components/billing/PlatformRazorpaySettingsForm';
import { TenantBillingList } from './PlatformTenantTelephonyPage';
import { AdminListTable } from '../components/admin/AdminListTable';
import { useDateTimeDisplay } from '../hooks/useDateTimeDisplay';
import pageStyles from '../features/disposition/components/MasterCRUDPage.module.scss';
import listStyles from '../components/admin/adminDataList.module.scss';

const PAGE_SIZE = 20;
const VALID_TABS = ['tenants', 'razorpay', 'payments', 'subscriptions'];

function formatInr(paise) {
  const n = Number(paise) / 100;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);
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
    default:
      return { label: s ? s.replace(/_/g, ' ') : 'Unknown', variant: 'default' };
  }
}

export function PlatformBillingPage() {
  const { formatDateTime } = useDateTimeDisplay();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab = VALID_TABS.includes(tabParam) ? tabParam : 'tenants';

  const setTab = (next) => {
    setSearchParams(next === 'tenants' ? {} : { tab: next }, { replace: true });
  };

  const [error, setError] = useState(null);
  const [draftTenantFilter, setDraftTenantFilter] = useState('');
  const [tenantFilter, setTenantFilter] = useState('');

  const [payments, setPayments] = useState([]);
  const [payTotal, setPayTotal] = useState(0);
  const [payPage, setPayPage] = useState(1);
  const [payLimit, setPayLimit] = useState(PAGE_SIZE);
  const [paySearch, setPaySearch] = useState('');
  const [payLoading, setPayLoading] = useState(false);

  const [subs, setSubs] = useState([]);
  const [subTotal, setSubTotal] = useState(0);
  const [subPage, setSubPage] = useState(1);
  const [subLimit, setSubLimit] = useState(PAGE_SIZE);
  const [subSearch, setSubSearch] = useState('');
  const [subLoading, setSubLoading] = useState(false);

  const loadPayments = useCallback(async () => {
    setPayLoading(true);
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
    } finally {
      setPayLoading(false);
    }
  }, [payPage, payLimit, paySearch, tenantFilter]);

  const loadSubs = useCallback(async () => {
    setSubLoading(true);
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
    } finally {
      setSubLoading(false);
    }
  }, [subPage, subLimit, subSearch, tenantFilter]);

  const applyTenantFilter = useCallback(() => {
    setTenantFilter(draftTenantFilter.trim());
    setPayPage(1);
    setSubPage(1);
  }, [draftTenantFilter]);

  const resetTenantFilter = useCallback(() => {
    setDraftTenantFilter('');
    setTenantFilter('');
    setPayPage(1);
    setSubPage(1);
  }, []);

  useEffect(() => {
    if (tab === 'payments') loadPayments();
  }, [tab, loadPayments]);

  useEffect(() => {
    if (tab === 'subscriptions') loadSubs();
  }, [tab, loadSubs]);

  const payTotalPages = Math.max(1, Math.ceil(payTotal / payLimit));
  const subTotalPages = Math.max(1, Math.ceil(subTotal / subLimit));

  const tenantFilterFields = (
    <Input
      label="Tenant ID"
      type="number"
      min={1}
      value={draftTenantFilter}
      onChange={(e) => setDraftTenantFilter(e.target.value)}
      placeholder="All tenants"
    />
  );

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Billing"
        subtitle="Manage tenant billing, Razorpay, and payment history. Configure product plans under Product plans."
      />

      {error ? (
        <Alert variant="error" className={listStyles.mb}>
          {error}
        </Alert>
      ) : null}

      <Tabs>
        <TabList>
          <Tab isActive={tab === 'tenants'} onClick={() => setTab('tenants')}>
            Tenant billing
          </Tab>
          <Tab isActive={tab === 'razorpay'} onClick={() => setTab('razorpay')}>
            Razorpay
          </Tab>
          <Tab isActive={tab === 'payments'} onClick={() => setTab('payments')}>
            All payments
          </Tab>
          <Tab isActive={tab === 'subscriptions'} onClick={() => setTab('subscriptions')}>
            All subscriptions
          </Tab>
        </TabList>

        <TabPanel isActive={tab === 'tenants'}>
          <TenantBillingList
            onOpenTenant={(t) =>
              navigate(`/admin/billing/tenant/${t.id}`, {
                state: { name: t.name, slug: t.slug },
              })
            }
          />
        </TabPanel>

        <TabPanel isActive={tab === 'razorpay'}>
          <PlatformRazorpaySettingsForm onError={setError} />
        </TabPanel>

        <TabPanel isActive={tab === 'payments'}>
          <AdminListTable
            filters={tenantFilterFields}
            onFilterApply={applyTenantFilter}
            onFilterReset={resetTenantFilter}
            search={paySearch}
            onSearch={(v) => {
              setPaySearch(v);
              setPayPage(1);
            }}
            searchPlaceholder="Search tenant, payment id… (press Enter)"
            page={payPage}
            totalPages={payTotalPages}
            total={payTotal}
            limit={payLimit}
            onPageChange={setPayPage}
            onLimitChange={(lim) => {
              setPayLimit(lim);
              setPayPage(1);
            }}
            loading={payLoading}
            isEmpty={!payLoading && payments.length === 0}
            emptyIcon="💳"
            emptyTitle={paySearch || tenantFilter ? 'No payments found' : 'No payments yet'}
            emptyDescription="Try another search or tenant filter."
            skeletonColumns={6}
          >
            <Table variant="adminList">
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
                {payments.map((row) => {
                  const pm = paymentBadgeMeta(row.status);
                  return (
                    <TableRow key={row.id}>
                      <TableCell>{formatDateTime(row.created_at)}</TableCell>
                      <TableCell>
                        {row.tenant_name || '—'}
                        <div className={listStyles.mutedSmall}>#{row.tenant_id}</div>
                      </TableCell>
                      <TableCell>{row.plan_name || '—'}</TableCell>
                      <TableCell>{formatInr(row.amount_paise)}</TableCell>
                      <TableCell>
                        <Badge variant={pm.variant} size="sm">
                          {pm.label}
                        </Badge>
                      </TableCell>
                      <TableCell className={listStyles.mono}>{row.razorpay_payment_id}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </AdminListTable>
        </TabPanel>

        <TabPanel isActive={tab === 'subscriptions'}>
          <AdminListTable
            filters={tenantFilterFields}
            onFilterApply={applyTenantFilter}
            onFilterReset={resetTenantFilter}
            search={subSearch}
            onSearch={(v) => {
              setSubSearch(v);
              setSubPage(1);
            }}
            searchPlaceholder="Search tenant or plan… (press Enter)"
            page={subPage}
            totalPages={subTotalPages}
            total={subTotal}
            limit={subLimit}
            onPageChange={setSubPage}
            onLimitChange={(lim) => {
              setSubLimit(lim);
              setSubPage(1);
            }}
            loading={subLoading}
            isEmpty={!subLoading && subs.length === 0}
            emptyIcon="📅"
            emptyTitle={subSearch || tenantFilter ? 'No subscriptions found' : 'No subscriptions yet'}
            emptyDescription="Try another search or tenant filter."
            skeletonColumns={5}
          >
            <Table variant="adminList">
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
          </AdminListTable>
        </TabPanel>
      </Tabs>
    </div>
  );
}
