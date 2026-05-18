import React, { useState, useCallback, useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Select } from '../components/ui/Select';
import { AdminListTable } from '../components/admin/AdminListTable';
import { billingAPI } from '../services/billingAPI';
import { tenantTelephonyAPI } from '../services/tenantTelephonyAPI';
import {
  formatPaiseAsInr,
  ledgerEntryTypeLabel,
  LEDGER_ENTRY_TYPES,
} from '../utils/callCreditsDisplay';
import {
  BILLING_HISTORY_ROUTES,
  formatBillingInr,
  paymentBadgeMeta,
  subscriptionBadgeMeta,
} from '../utils/billingDisplay';
import { useAppSelector } from '../app/hooks';
import { selectUser } from '../features/auth/authSelectors';
import { useDateTimeDisplay } from '../hooks/useDateTimeDisplay';
import { useTenant } from '../context/TenantContext';
import { PRODUCT_DISPLAY_NAME } from '../config/productBrand';
import { downloadPaymentInvoiceHtml } from '../utils/billingInvoiceDownload';
import styles from './BillingHistoryPage.module.scss';
import billingStyles from './BillingPage.module.scss';

const PAGE_SIZE = 20;
const VALID_SECTIONS = ['payments', 'subscriptions', 'wallet'];

const SECTION_META = {
  payments: {
    title: 'Payments & invoices',
    subtitle: 'All charges for your workspace. Download invoices per row.',
    backTab: 'payments',
  },
  subscriptions: {
    title: 'Subscription history',
    subtitle: 'Past and current plan periods from telephony checkout.',
    backTab: 'subscriptions',
  },
  wallet: {
    title: 'Wallet history',
    subtitle: 'Call credit top-ups, plan-included credits, and per-call debits.',
    backTab: 'wallet',
  },
};

export function BillingHistoryPage() {
  const { section: sectionParam } = useParams();
  const section = VALID_SECTIONS.includes(sectionParam) ? sectionParam : null;
  const navigate = useNavigate();
  const user = useAppSelector(selectUser);
  const { tenantSlug } = useTenant();
  const { formatDateTime } = useDateTimeDisplay();
  const meta = section ? SECTION_META[section] : null;

  const [error, setError] = useState(null);

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

  const [walletRows, setWalletRows] = useState([]);
  const [walletTotal, setWalletTotal] = useState(0);
  const [walletPage, setWalletPage] = useState(1);
  const [walletLimit, setWalletLimit] = useState(PAGE_SIZE);
  const [walletSearch, setWalletSearch] = useState('');
  const [draftWalletEntryType, setDraftWalletEntryType] = useState('');
  const [walletEntryType, setWalletEntryType] = useState('');
  const [walletLoading, setWalletLoading] = useState(false);

  const loadPayments = useCallback(async () => {
    setPayLoading(true);
    setError(null);
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
    } finally {
      setPayLoading(false);
    }
  }, [payPage, payLimit, paySearch]);

  const loadSubs = useCallback(async () => {
    setSubLoading(true);
    setError(null);
    try {
      const res = await billingAPI.listSubscriptions({
        page: subPage,
        limit: subLimit,
        search: subSearch || undefined,
      });
      setSubs(res.data?.data ?? []);
      setSubTotal(res.data?.total ?? 0);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to load subscriptions');
    } finally {
      setSubLoading(false);
    }
  }, [subPage, subLimit, subSearch]);

  const loadWallet = useCallback(async () => {
    setWalletLoading(true);
    setError(null);
    try {
      const res = await tenantTelephonyAPI.listLedger({
        page: walletPage,
        limit: walletLimit,
        search: walletSearch || undefined,
        entry_type: walletEntryType || undefined,
      });
      const payload = res.data?.data ?? {};
      setWalletRows(payload.rows ?? []);
      setWalletTotal(payload.total ?? 0);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to load wallet history');
    } finally {
      setWalletLoading(false);
    }
  }, [walletPage, walletLimit, walletSearch, walletEntryType]);

  const applyWalletFilters = useCallback(() => {
    setWalletEntryType(draftWalletEntryType);
    setWalletPage(1);
  }, [draftWalletEntryType]);

  const resetWalletFilters = useCallback(() => {
    setDraftWalletEntryType('');
    setWalletEntryType('');
    setWalletPage(1);
  }, []);

  useEffect(() => {
    if (section === 'payments') loadPayments();
  }, [section, loadPayments]);

  useEffect(() => {
    if (section === 'subscriptions') loadSubs();
  }, [section, loadSubs]);

  useEffect(() => {
    if (section === 'wallet') loadWallet();
  }, [section, loadWallet]);

  const onDownloadInvoice = (row) => {
    downloadPaymentInvoiceHtml({
      payment: row,
      customerEmail: user?.email,
      workspaceLabel: tenantSlug || undefined,
      productName: PRODUCT_DISPLAY_NAME,
    });
  };

  if (!section) {
    return <Navigate to="/settings/billing" replace />;
  }

  const payTotalPages = Math.max(1, Math.ceil(payTotal / payLimit));
  const subTotalPages = Math.max(1, Math.ceil(subTotal / subLimit));
  const walletTotalPages = Math.max(1, Math.ceil(walletTotal / walletLimit));

  const backHref = `/settings/billing?tab=${meta.backTab}`;

  return (
    <div className={styles.page}>
      <PageHeader
        title={meta.title}
        subtitle={meta.subtitle}
        actions={
          <Button type="button" variant="secondary" size="sm" onClick={() => navigate(backHref)}>
            Back to Plans & billing
          </Button>
        }
      />

      {error ? (
        <Alert variant="error" className={styles.mb}>
          {error}
        </Alert>
      ) : null}

      {section === 'payments' ? (
        <AdminListTable
          search={paySearch}
          onSearch={(v) => {
            setPaySearch(v);
            setPayPage(1);
          }}
          searchPlaceholder="Search by payment or order id… (press Enter)"
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
          emptyTitle={paySearch ? 'No payments found' : 'No payments yet'}
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
                    <TableCell className={billingStyles.mono}>{row.razorpay_payment_id}</TableCell>
                    <TableCell align="right" className={billingStyles.actionCell}>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => onDownloadInvoice(row)}
                      >
                        Download
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </AdminListTable>
      ) : null}

      {section === 'subscriptions' ? (
        <AdminListTable
          search={subSearch}
          onSearch={(v) => {
            setSubSearch(v);
            setSubPage(1);
          }}
          searchPlaceholder="Search plan or payment id… (press Enter)"
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
          emptyTitle={subSearch ? 'No subscriptions found' : 'No subscription history yet'}
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
                    <TableCell className={billingStyles.mono}>{row.razorpay_payment_id || '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </AdminListTable>
      ) : null}

      {section === 'wallet' ? (
        <AdminListTable
          filters={
            <Select
              label="Entry type"
              value={draftWalletEntryType}
              onChange={setDraftWalletEntryType}
              options={LEDGER_ENTRY_TYPES}
              searchable={false}
              compact
            />
          }
          onFilterApply={applyWalletFilters}
          onFilterReset={resetWalletFilters}
          search={walletSearch}
          onSearch={(v) => {
            setWalletSearch(v);
            setWalletPage(1);
          }}
          searchPlaceholder="Search type, note, or call id… (press Enter)"
          page={walletPage}
          totalPages={walletTotalPages}
          total={walletTotal}
          limit={walletLimit}
          onPageChange={setWalletPage}
          onLimitChange={(lim) => {
            setWalletLimit(lim);
            setWalletPage(1);
          }}
          loading={walletLoading}
          isEmpty={!walletLoading && walletRows.length === 0}
          emptyIcon="💰"
          emptyTitle={walletSearch || walletEntryType ? 'No transactions found' : 'No wallet transactions yet'}
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
        </AdminListTable>
      ) : null}
    </div>
  );
}
