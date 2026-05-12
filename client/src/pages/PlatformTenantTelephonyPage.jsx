import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Checkbox } from '../components/ui/Checkbox';
import { Alert } from '../components/ui/Alert';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { SearchInput } from '../components/ui/SearchInput';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeaderCell,
} from '../components/ui/Table';
import { Pagination } from '../components/ui/Pagination';
import { tenantsAPI } from '../services/adminAPI';
import { tenantTelephonyAdminAPI } from '../services/tenantTelephonyAdminAPI';
import { useDateTimeDisplay } from '../hooks/useDateTimeDisplay';
import styles from './PlatformTenantTelephonyPage.module.scss';

const PAGE_SIZE = 20;

function formatPaiseAsInr(paise) {
  const n = Number(paise) / 100;
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);
}

function formatMinutes(min) {
  const n = Number(min);
  if (!Number.isFinite(n)) return '0 min';
  if (n < 60) return `${Math.round(n)} min`;
  const h = Math.floor(n / 60);
  const m = Math.round(n - h * 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function safeNumber(v) {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

const ACCOUNT_MODE_OPTIONS = [
  { value: 'default_account', label: 'Default account (platform Exotel)' },
  { value: 'byo_account', label: 'BYO account (tenant-owned)' },
];

const BILLING_MODE_OPTIONS = [
  { value: 'credit', label: 'Credit (debit wallet per minute)' },
  { value: 'unlimited', label: 'Unlimited (no per-call debit)' },
];

const TOPUP_ENTRY_TYPE_OPTIONS = [
  { value: 'topup', label: 'Top-up (counts toward lifetime topup)' },
  { value: 'adjustment_credit', label: 'Adjustment credit' },
  { value: 'refund', label: 'Refund' },
];

/* -------------------------------------------------------------------------- */
/* Platform defaults card                                                     */
/* -------------------------------------------------------------------------- */
function PlatformDefaultsCard({ onError }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    default_call_rate_paise_per_minute: '',
    default_byo_platform_fee_paise_per_minute: '',
    default_call_min_balance_paise: '',
    default_unlimited_minutes_cap_per_month: '',
  });
  const [saved, setSaved] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await tenantTelephonyAdminAPI.getPlatformSettings();
      const d = res.data?.data || {};
      setDraft({
        default_call_rate_paise_per_minute: String(d.default_call_rate_paise_per_minute ?? ''),
        default_byo_platform_fee_paise_per_minute: String(
          d.default_byo_platform_fee_paise_per_minute ?? ''
        ),
        default_call_min_balance_paise: String(d.default_call_min_balance_paise ?? ''),
        default_unlimited_minutes_cap_per_month: String(
          d.default_unlimited_minutes_cap_per_month ?? ''
        ),
      });
      setSaved(d);
    } catch (e) {
      onError(e?.response?.data?.error || e.message || 'Failed to load platform settings');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      const body = {
        default_call_rate_paise_per_minute: safeNumber(draft.default_call_rate_paise_per_minute),
        default_byo_platform_fee_paise_per_minute: safeNumber(
          draft.default_byo_platform_fee_paise_per_minute
        ),
        default_call_min_balance_paise: safeNumber(draft.default_call_min_balance_paise),
        default_unlimited_minutes_cap_per_month: safeNumber(
          draft.default_unlimited_minutes_cap_per_month
        ),
      };
      const res = await tenantTelephonyAdminAPI.updatePlatformSettings(body);
      const d = res.data?.data || {};
      setSaved(d);
      onError(null);
    } catch (e) {
      onError(e?.response?.data?.error || e.message || 'Failed to save platform settings');
    } finally {
      setSaving(false);
    }
  }

  const equivalents = useMemo(
    () => ({
      rate: formatPaiseAsInr(draft.default_call_rate_paise_per_minute),
      byo: formatPaiseAsInr(draft.default_byo_platform_fee_paise_per_minute),
      min: formatPaiseAsInr(draft.default_call_min_balance_paise),
    }),
    [draft]
  );

  return (
    <Card className={styles.card}>
      <header className={styles.cardHead}>
        <div>
          <h3 className={styles.cardTitle}>Platform defaults</h3>
          <p className={styles.cardSub}>
            Applied to every tenant unless a per-tenant override is set. Amounts are in paise (₹1 = 100 paise).
          </p>
        </div>
        {saved ? (
          <span className={styles.savedTag}>
            Saved: {formatPaiseAsInr(saved.default_call_rate_paise_per_minute)} / min
          </span>
        ) : null}
      </header>

      <div className={styles.formGrid}>
        <Input
          label="Default call rate (paise / connected minute)"
          type="number"
          min={0}
          value={draft.default_call_rate_paise_per_minute}
          disabled={loading}
          onChange={(e) =>
            setDraft((d) => ({ ...d, default_call_rate_paise_per_minute: e.target.value }))
          }
          hint={`≈ ${equivalents.rate} / minute for default-account tenants on credit mode.`}
        />
        <Input
          label="BYO platform fee (paise / connected minute)"
          type="number"
          min={0}
          value={draft.default_byo_platform_fee_paise_per_minute}
          disabled={loading}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              default_byo_platform_fee_paise_per_minute: e.target.value,
            }))
          }
          hint={`≈ ${equivalents.byo} / minute for BYO tenants on credit mode.`}
        />
        <Input
          label="Minimum balance to start a call (paise)"
          type="number"
          min={0}
          value={draft.default_call_min_balance_paise}
          disabled={loading}
          onChange={(e) =>
            setDraft((d) => ({ ...d, default_call_min_balance_paise: e.target.value }))
          }
          hint={`Calls are blocked when wallet balance falls below this. ≈ ${equivalents.min}.`}
        />
        <Input
          label="Default monthly cap for unlimited mode (minutes)"
          type="number"
          min={0}
          value={draft.default_unlimited_minutes_cap_per_month}
          disabled={loading}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              default_unlimited_minutes_cap_per_month: e.target.value,
            }))
          }
          hint="0 means truly uncapped. Used by tenants on the 'unlimited' billing mode."
        />
      </div>

      <div className={styles.cardActions}>
        <Button onClick={save} disabled={loading || saving}>
          {saving ? 'Saving…' : 'Save platform defaults'}
        </Button>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Per-tenant edit modal — adaptive stats + modes + accounts + ops + ledger   */
/* -------------------------------------------------------------------------- */
function WalletOrUnlimitedStats({ data }) {
  const wallet = data?.wallet;
  const cfg = data?.config;
  const usage = data?.usage;
  if (!cfg) return null;

  const isCredit = cfg.callBillingMode === 'credit';
  const cap = usage?.unlimited_cap;

  return (
    <div className={styles.statsRow}>
      {isCredit ? (
        <>
          <div className={`${styles.statBox} ${styles.statBoxPrimary}`}>
            <div className={styles.statLabel}>Wallet balance</div>
            <div className={styles.statValue}>
              {formatPaiseAsInr(wallet?.balance_paise || 0)}
              <span className={styles.statUnit}>
                {' '}
                ({wallet?.balance_paise || 0} paise)
              </span>
            </div>
            <div className={styles.statFoot}>
              Applied rate {formatPaiseAsInr(cfg.ratePaisePerMinute)} / min
              {cfg.isBYO ? ' (BYO platform fee)' : ' (default account)'}
            </div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statLabel}>Lifetime topup</div>
            <div className={styles.statValue}>
              {formatPaiseAsInr(wallet?.lifetime_topup_paise || 0)}
            </div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statLabel}>Lifetime spent</div>
            <div className={styles.statValue}>
              {formatPaiseAsInr(wallet?.lifetime_spent_paise || 0)}
            </div>
            <div className={styles.statFoot}>
              This month: {formatPaiseAsInr(usage?.this_month?.spend_paise || 0)}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className={`${styles.statBox} ${styles.statBoxPrimary}`}>
            <div className={styles.statLabel}>Plan</div>
            <div className={styles.statValue}>
              Unlimited calling
              {cap?.enabled ? (
                <span className={styles.statUnit}> · cap {cap.cap_minutes_per_month} min/mo</span>
              ) : (
                <span className={styles.statUnit}> · no cap</span>
              )}
            </div>
            {cap?.enabled ? (
              <div className={styles.statFoot}>
                <span className={cap.exceeded ? styles.amountNeg : ''}>
                  {cap.used_minutes} / {cap.cap_minutes_per_month} min used ({cap.used_pct}%)
                </span>
                <div className={styles.capBar}>
                  <div
                    className={cap.exceeded ? styles.capBarFillOver : styles.capBarFill}
                    style={{ width: `${Math.min(100, cap.used_pct || 0)}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className={styles.statFoot}>No monthly cap configured.</div>
            )}
          </div>
          <div className={styles.statBox}>
            <div className={styles.statLabel}>This month minutes</div>
            <div className={styles.statValue}>
              {formatMinutes(usage?.this_month?.minutes || 0)}
            </div>
            <div className={styles.statFoot}>{usage?.this_month?.calls || 0} connected calls</div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statLabel}>Today</div>
            <div className={styles.statValue}>
              {formatMinutes(usage?.today?.minutes || 0)}
            </div>
            <div className={styles.statFoot}>{usage?.today?.calls || 0} connected calls</div>
          </div>
        </>
      )}

      {/* Always shown — last-30-day rolling. */}
      <div className={styles.statBox}>
        <div className={styles.statLabel}>Last 30 days</div>
        <div className={styles.statValue}>
          {formatMinutes(usage?.last_30d?.minutes || 0)}
        </div>
        <div className={styles.statFoot}>{usage?.last_30d?.calls || 0} connected calls</div>
      </div>
    </div>
  );
}

/* ------- Provider accounts section (BYO Exotel CRUD) -------------------- */
const BLANK_ACCOUNT_FORM = {
  label: '',
  is_active: true,
  is_default: true,
  caller_id_e164: '',
  agent_leg_e164: '',
  status_callback_url: '',
  credentials: {
    exotel_sid: '',
    exotel_api_key: '',
    exotel_api_token: '',
    exotel_subdomain: '',
  },
};

function CopyableUrl({ url }) {
  const [copied, setCopied] = useState(false);
  if (!url) return null;
  return (
    <div className={styles.urlRow}>
      <code className={styles.url}>{url}</code>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          navigator.clipboard?.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? 'Copied!' : 'Copy'}
      </Button>
    </div>
  );
}

function ProviderAccountsSection({ tenant, onChanged, onError }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(BLANK_ACCOUNT_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);
    try {
      const res = await tenantTelephonyAdminAPI.listAccounts(tenant.id);
      setAccounts(res.data?.data || []);
    } catch (e) {
      onError(e?.response?.data?.error || e.message || 'Failed to load provider accounts');
    } finally {
      setLoading(false);
    }
  }, [tenant?.id, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  function openNew() {
    setEditingId(null);
    setForm(BLANK_ACCOUNT_FORM);
    setShowForm(true);
  }

  function openEdit(acc) {
    setEditingId(acc.id);
    setForm({
      label: acc.label || '',
      is_active: !!acc.is_active,
      is_default: !!acc.is_default,
      caller_id_e164: acc.caller_id_e164 || '',
      agent_leg_e164: acc.agent_leg_e164 || '',
      status_callback_url: acc.status_callback_url || '',
      credentials: {
        exotel_sid: '',
        exotel_api_key: '',
        exotel_api_token: '',
        exotel_subdomain: '',
      },
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(BLANK_ACCOUNT_FORM);
  }

  async function save() {
    if (!tenant?.id) return;
    setSaving(true);
    try {
      const body = {
        label: form.label,
        is_active: !!form.is_active,
        is_default: !!form.is_default,
        caller_id_e164: form.caller_id_e164 || null,
        agent_leg_e164: form.agent_leg_e164 || null,
        status_callback_url: form.status_callback_url || null,
      };
      const creds = form.credentials || {};
      const hasAnyCred =
        creds.exotel_sid ||
        creds.exotel_api_key ||
        creds.exotel_api_token ||
        creds.exotel_subdomain;
      if (editingId == null) {
        // Create requires all four credential fields.
        body.provider_code = 'exotel';
        body.credentials = creds;
        await tenantTelephonyAdminAPI.createAccount(tenant.id, body);
      } else {
        if (hasAnyCred) {
          body.credentials = creds;
        }
        await tenantTelephonyAdminAPI.updateAccount(tenant.id, editingId, body);
      }
      closeForm();
      await load();
      onChanged?.();
    } catch (e) {
      onError(e?.response?.data?.error || e.message || 'Failed to save provider account');
    } finally {
      setSaving(false);
    }
  }

  async function rotate(acc) {
    if (!confirm('Rotate the webhook token for this account? Any pending Exotel webhook callbacks using the old token will fail.')) return;
    try {
      await tenantTelephonyAdminAPI.rotateAccountWebhookToken(tenant.id, acc.id);
      await load();
    } catch (e) {
      onError(e?.response?.data?.error || e.message || 'Rotate failed');
    }
  }

  async function remove(acc) {
    if (!confirm(`Soft-delete provider account "${acc.label}"? It will be disabled immediately. The tenant will fall back to the platform default account if no other active account exists.`)) return;
    try {
      await tenantTelephonyAdminAPI.deleteAccount(tenant.id, acc.id);
      await load();
      onChanged?.();
    } catch (e) {
      onError(e?.response?.data?.error || e.message || 'Delete failed');
    }
  }

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h4 className={styles.sectionTitle}>Provider accounts (BYO Exotel)</h4>
        <Button size="sm" onClick={openNew}>+ Add account</Button>
      </div>
      {loading && !accounts.length ? (
        <p className={styles.muted}>Loading…</p>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Label</TableHeaderCell>
              <TableHeaderCell>Account SID</TableHeaderCell>
              <TableHeaderCell>Caller ID</TableHeaderCell>
              <TableHeaderCell>Agent leg</TableHeaderCell>
              <TableHeaderCell>Webhook URL</TableHeaderCell>
              <TableHeaderCell>State</TableHeaderCell>
              <TableHeaderCell aria-label="Actions" />
            </TableRow>
          </TableHead>
          <TableBody>
            {accounts.map((acc) => (
              <TableRow key={acc.id}>
                <TableCell>
                  <div className={styles.tenantCell}>
                    <strong>{acc.label}</strong>
                    <span className={styles.muted}>{acc.credentials_hint || acc.provider_code}</span>
                  </div>
                </TableCell>
                <TableCell className={styles.mono}>{acc.account_sid || '—'}</TableCell>
                <TableCell className={styles.mono}>{acc.caller_id_e164 || '—'}</TableCell>
                <TableCell className={styles.mono}>{acc.agent_leg_e164 || '—'}</TableCell>
                <TableCell>
                  <CopyableUrl url={acc.webhook_url} />
                </TableCell>
                <TableCell>
                  <div className={styles.badgeStack}>
                    <Badge variant={acc.is_active ? 'success' : 'muted'}>
                      {acc.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    {acc.is_default ? <Badge variant="default">Default</Badge> : null}
                  </div>
                </TableCell>
                <TableCell>
                  <div className={styles.rowActions}>
                    <Button variant="secondary" size="sm" onClick={() => openEdit(acc)}>
                      Edit
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => rotate(acc)}>
                      Rotate webhook
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => remove(acc)}>
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {!accounts.length && !loading ? (
        <p className={styles.muted}>
          No BYO provider accounts configured. While in <strong>default_account</strong> mode the
          tenant uses the platform Exotel account. Add a BYO account to let them use their own Exotel.
        </p>
      ) : null}

      {showForm ? (
        <Card className={`${styles.opCard} ${styles.accountFormCard}`}>
          <div className={styles.opTitle}>
            {editingId == null ? 'Add provider account' : `Edit account #${editingId}`}
          </div>
          <div className={styles.formGrid}>
            <Input
              label="Label *"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="e.g. Acme Exotel India primary"
            />
            <Input
              label="Caller ID (E.164)"
              value={form.caller_id_e164}
              onChange={(e) => setForm((f) => ({ ...f, caller_id_e164: e.target.value }))}
              placeholder="+91XXXXXXXXXX"
            />
            <Input
              label="Agent leg (E.164)"
              value={form.agent_leg_e164}
              onChange={(e) => setForm((f) => ({ ...f, agent_leg_e164: e.target.value }))}
              placeholder="+91XXXXXXXXXX"
            />
            <Input
              label="Status callback URL (optional override)"
              value={form.status_callback_url}
              onChange={(e) => setForm((f) => ({ ...f, status_callback_url: e.target.value }))}
              placeholder="Leave blank to use the per-account webhook URL"
            />
          </div>
          <h5 className={styles.subsectionTitle}>
            Exotel credentials {editingId != null ? '(leave blank to keep current)' : '*'}
          </h5>
          <div className={styles.formGrid}>
            <Input
              label="Account SID"
              value={form.credentials.exotel_sid}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  credentials: { ...f.credentials, exotel_sid: e.target.value },
                }))
              }
              placeholder="e.g. acme_company"
            />
            <Input
              label="Subdomain"
              value={form.credentials.exotel_subdomain}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  credentials: { ...f.credentials, exotel_subdomain: e.target.value },
                }))
              }
              placeholder="e.g. api.exotel.com or api.in.exotel.com"
            />
            <Input
              label="API Key"
              value={form.credentials.exotel_api_key}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  credentials: { ...f.credentials, exotel_api_key: e.target.value },
                }))
              }
              type="password"
            />
            <Input
              label="API Token"
              value={form.credentials.exotel_api_token}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  credentials: { ...f.credentials, exotel_api_token: e.target.value },
                }))
              }
              type="password"
            />
          </div>
          <div className={styles.toggleRow}>
            <Checkbox
              label="Active"
              checked={!!form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            <Checkbox
              label="Default (preferred) account for this tenant"
              checked={!!form.is_default}
              onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
            />
          </div>
          <div className={styles.sectionActions}>
            <Button variant="secondary" onClick={closeForm} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : editingId == null ? 'Create account' : 'Save changes'}
            </Button>
          </div>
        </Card>
      ) : null}
    </section>
  );
}

/* ----- The main modal --------------------------------------------------- */
function TenantBillingEditModal({ tenant, isOpen, onClose, onSaved }) {
  const { formatDateTime } = useDateTimeDisplay();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);

  const [topupAmount, setTopupAmount] = useState('');
  const [topupNote, setTopupNote] = useState('');
  const [topupType, setTopupType] = useState('topup');
  const [topupBusy, setTopupBusy] = useState(false);

  const [debitAmount, setDebitAmount] = useState('');
  const [debitNote, setDebitNote] = useState('');
  const [debitBusy, setDebitBusy] = useState(false);

  const [ledger, setLedger] = useState({ rows: [], page: 1, total: 0, limit: 10 });
  const [ledgerBusy, setLedgerBusy] = useState(false);

  const loadEverything = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);
    setError(null);
    try {
      const [billRes, ledgerRes] = await Promise.all([
        tenantTelephonyAdminAPI.getTenantBilling(tenant.id),
        tenantTelephonyAdminAPI.listLedger(tenant.id, { page: 1, limit: 10 }),
      ]);
      const billData = billRes.data?.data;
      setData(billData);
      setDraft({
        telephony_account_mode: billData?.tenant?.telephony_account_mode || 'default_account',
        call_billing_mode: billData?.tenant?.call_billing_mode || 'credit',
        call_rate_paise_per_minute_override:
          billData?.tenant?.call_rate_paise_per_minute_override == null
            ? ''
            : String(billData.tenant.call_rate_paise_per_minute_override),
        byo_platform_fee_paise_per_minute_override:
          billData?.tenant?.byo_platform_fee_paise_per_minute_override == null
            ? ''
            : String(billData.tenant.byo_platform_fee_paise_per_minute_override),
        call_min_balance_paise_override:
          billData?.tenant?.call_min_balance_paise_override == null
            ? ''
            : String(billData.tenant.call_min_balance_paise_override),
        unlimited_minutes_cap_per_month_override:
          billData?.tenant?.unlimited_minutes_cap_per_month_override == null
            ? ''
            : String(billData.tenant.unlimited_minutes_cap_per_month_override),
      });
      setLedger({
        rows: ledgerRes.data?.data?.rows || [],
        page: ledgerRes.data?.data?.page || 1,
        total: ledgerRes.data?.data?.total || 0,
        limit: ledgerRes.data?.data?.limit || 10,
      });
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to load tenant billing');
    } finally {
      setLoading(false);
    }
  }, [tenant?.id]);

  useEffect(() => {
    if (isOpen) {
      void loadEverything();
    } else {
      setData(null);
      setDraft(null);
      setError(null);
      setTopupAmount('');
      setTopupNote('');
      setTopupType('topup');
      setDebitAmount('');
      setDebitNote('');
    }
  }, [isOpen, loadEverything]);

  async function changePage(nextPage) {
    if (!tenant?.id) return;
    setLedgerBusy(true);
    try {
      const res = await tenantTelephonyAdminAPI.listLedger(tenant.id, {
        page: nextPage,
        limit: ledger.limit,
      });
      setLedger({
        rows: res.data?.data?.rows || [],
        page: res.data?.data?.page || nextPage,
        total: res.data?.data?.total || 0,
        limit: res.data?.data?.limit || ledger.limit,
      });
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to load ledger');
    } finally {
      setLedgerBusy(false);
    }
  }

  async function saveBilling() {
    if (!tenant?.id || !draft) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        telephony_account_mode: draft.telephony_account_mode,
        call_billing_mode: draft.call_billing_mode,
        call_rate_paise_per_minute_override:
          draft.call_rate_paise_per_minute_override === ''
            ? null
            : safeNumber(draft.call_rate_paise_per_minute_override),
        byo_platform_fee_paise_per_minute_override:
          draft.byo_platform_fee_paise_per_minute_override === ''
            ? null
            : safeNumber(draft.byo_platform_fee_paise_per_minute_override),
        call_min_balance_paise_override:
          draft.call_min_balance_paise_override === ''
            ? null
            : safeNumber(draft.call_min_balance_paise_override),
        unlimited_minutes_cap_per_month_override:
          draft.unlimited_minutes_cap_per_month_override === ''
            ? null
            : safeNumber(draft.unlimited_minutes_cap_per_month_override),
      };
      const res = await tenantTelephonyAdminAPI.updateTenantBilling(tenant.id, body);
      setData(res.data?.data);
      onSaved?.();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to save tenant billing');
    } finally {
      setSaving(false);
    }
  }

  async function topup() {
    if (!tenant?.id) return;
    const amt = safeNumber(topupAmount);
    if (!amt || amt <= 0) {
      setError('Top-up amount must be a positive integer in paise');
      return;
    }
    setTopupBusy(true);
    setError(null);
    try {
      await tenantTelephonyAdminAPI.topupCredits(tenant.id, {
        amount_paise: amt,
        entry_type: topupType,
        note: topupNote || null,
      });
      setTopupAmount('');
      setTopupNote('');
      await loadEverything();
      onSaved?.();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Top-up failed');
    } finally {
      setTopupBusy(false);
    }
  }

  async function debit() {
    if (!tenant?.id) return;
    const amt = safeNumber(debitAmount);
    if (!amt || amt <= 0) {
      setError('Debit amount must be a positive integer in paise');
      return;
    }
    setDebitBusy(true);
    setError(null);
    try {
      await tenantTelephonyAdminAPI.debitCredits(tenant.id, {
        amount_paise: amt,
        note: debitNote || null,
      });
      setDebitAmount('');
      setDebitNote('');
      await loadEverything();
      onSaved?.();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Debit failed');
    } finally {
      setDebitBusy(false);
    }
  }

  const isCredit = data?.config?.callBillingMode === 'credit';
  const isUnlimited = data?.config?.callBillingMode === 'unlimited';
  const totalPages = Math.max(1, Math.ceil((ledger.total || 0) / (ledger.limit || 10)));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={tenant ? `Telephony billing — ${tenant.name || tenant.slug}` : 'Tenant telephony billing'}
      subtitle={tenant ? `tenant #${tenant.id}` : null}
      footer={
        <div className={styles.modalFooter}>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      {error ? (
        <Alert variant="error" className={styles.alertGap}>
          {error}
        </Alert>
      ) : null}

      {loading || !draft || !data ? (
        <p className={styles.muted}>Loading…</p>
      ) : (
        <div className={styles.modalBody}>
          {/* Adaptive stats row — wallet for credit; cap+usage for unlimited. */}
          <WalletOrUnlimitedStats data={data} />

          {/* Modes + per-tenant overrides */}
          <section className={styles.section}>
            <h4 className={styles.sectionTitle}>Modes & overrides</h4>
            <div className={styles.formGrid}>
              <Select
                label="Telephony account mode"
                value={draft.telephony_account_mode}
                options={ACCOUNT_MODE_OPTIONS}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, telephony_account_mode: e.target.value }))
                }
                hint="default_account uses the platform Exotel; byo_account uses one of this tenant's BYO accounts below."
              />
              <Select
                label="Call billing mode"
                value={draft.call_billing_mode}
                options={BILLING_MODE_OPTIONS}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, call_billing_mode: e.target.value }))
                }
                hint="credit deducts the wallet per minute; unlimited tracks usage and (optionally) enforces a monthly cap."
              />
              {draft.call_billing_mode === 'credit' ? (
                <>
                  <Input
                    label="Call rate override (paise / minute, default-account)"
                    type="number"
                    min={0}
                    value={draft.call_rate_paise_per_minute_override}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        call_rate_paise_per_minute_override: e.target.value,
                      }))
                    }
                    placeholder="Leave blank to use platform default"
                  />
                  <Input
                    label="BYO platform fee override (paise / minute)"
                    type="number"
                    min={0}
                    value={draft.byo_platform_fee_paise_per_minute_override}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        byo_platform_fee_paise_per_minute_override: e.target.value,
                      }))
                    }
                    placeholder="Leave blank to use platform default"
                  />
                  <Input
                    label="Minimum balance override (paise)"
                    type="number"
                    min={0}
                    value={draft.call_min_balance_paise_override}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        call_min_balance_paise_override: e.target.value,
                      }))
                    }
                    placeholder="Leave blank to use platform default"
                  />
                </>
              ) : (
                <Input
                  label="Monthly cap override (minutes)"
                  type="number"
                  min={0}
                  value={draft.unlimited_minutes_cap_per_month_override}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      unlimited_minutes_cap_per_month_override: e.target.value,
                    }))
                  }
                  placeholder="Leave blank to use platform default. 0 = truly uncapped."
                  hint="When the tenant hits this many connected minutes in a calendar month, new calls are blocked."
                />
              )}
            </div>
            <div className={styles.sectionActions}>
              <Button onClick={saveBilling} disabled={saving}>
                {saving ? 'Saving…' : 'Save tenant config'}
              </Button>
            </div>
          </section>

          {/* BYO provider accounts */}
          <ProviderAccountsSection
            tenant={tenant}
            onChanged={loadEverything}
            onError={setError}
          />

          {/* Manual wallet operations — only meaningful for credit mode. */}
          {isCredit ? (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>Manual wallet operations</h4>
              <div className={styles.opsGrid}>
                <Card className={styles.opCard}>
                  <div className={styles.opTitle}>Add credits</div>
                  <div className={styles.opFormCol}>
                    <Input
                      label="Amount (paise)"
                      type="number"
                      min={1}
                      value={topupAmount}
                      onChange={(e) => setTopupAmount(e.target.value)}
                      placeholder="e.g. 50000 = ₹500"
                      hint={topupAmount ? `≈ ${formatPaiseAsInr(topupAmount)}` : undefined}
                    />
                    <Select
                      label="Entry type"
                      value={topupType}
                      options={TOPUP_ENTRY_TYPE_OPTIONS}
                      onChange={(e) => setTopupType(e.target.value)}
                    />
                    <Input
                      label="Note (optional)"
                      value={topupNote}
                      onChange={(e) => setTopupNote(e.target.value)}
                      placeholder="e.g. Manual top-up; ref INV-123"
                    />
                    <Button onClick={topup} disabled={topupBusy}>
                      {topupBusy ? 'Adding…' : 'Add to wallet'}
                    </Button>
                  </div>
                </Card>
                <Card className={styles.opCard}>
                  <div className={styles.opTitle}>Adjust debit</div>
                  <div className={styles.opFormCol}>
                    <Input
                      label="Amount (paise)"
                      type="number"
                      min={1}
                      value={debitAmount}
                      onChange={(e) => setDebitAmount(e.target.value)}
                      placeholder="e.g. 5000 = ₹50"
                      hint={debitAmount ? `≈ ${formatPaiseAsInr(debitAmount)}` : undefined}
                    />
                    <Input
                      label="Note (optional)"
                      value={debitNote}
                      onChange={(e) => setDebitNote(e.target.value)}
                      placeholder="e.g. Correction for failed call"
                    />
                    <Button variant="secondary" onClick={debit} disabled={debitBusy}>
                      {debitBusy ? 'Debiting…' : 'Debit wallet'}
                    </Button>
                  </div>
                </Card>
              </div>
            </section>
          ) : null}

          {/* Ledger — credit mode only (unlimited mode never debits the wallet). */}
          {isCredit ? (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>Ledger</h4>
              <Table>
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
                  {ledger.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{formatDateTime(row.created_at)}</TableCell>
                      <TableCell>
                        <span className={styles.entryType}>{row.entry_type}</span>
                      </TableCell>
                      <TableCell
                        className={Number(row.amount_paise) < 0 ? styles.amountNeg : styles.amountPos}
                      >
                        {formatPaiseAsInr(row.amount_paise)}
                        {row.unit_qty != null ? (
                          <span className={styles.muted}>
                            {' '}
                            ({row.unit_qty} min × {row.unit_rate_paise}p)
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>{formatPaiseAsInr(row.balance_after_paise)}</TableCell>
                      <TableCell>{row.call_attempt_id || '—'}</TableCell>
                      <TableCell>{row.note || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!ledger.rows.length && (
                <p className={styles.muted}>No ledger entries yet.</p>
              )}
              <Pagination
                page={ledger.page}
                totalPages={totalPages}
                total={ledger.total}
                limit={ledger.limit}
                onPageChange={(p) => { if (!ledgerBusy) changePage(p); }}
                hidePageSize
              />
            </section>
          ) : null}

          {isUnlimited ? (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>About unlimited mode</h4>
              <p className={styles.muted}>
                Calls are not debited from the wallet on this plan. Usage is still tracked
                (minutes &amp; calls) and the monthly cap above blocks new calls once exceeded.
                If you want this tenant to pay per minute instead, switch{' '}
                <strong>Call billing mode</strong> to <strong>Credit</strong> and add credits.
              </p>
            </section>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Tenant list (drives the modal)                                             */
/* -------------------------------------------------------------------------- */
function TenantBillingList({ refreshKey, onOpenTenant }) {
  const [tenants, setTenants] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await tenantsAPI.getAll({
        search,
        page,
        limit: PAGE_SIZE,
        includeDisabled: false,
      });
      setTenants(res.data?.data || []);
      setTotal(res.data?.pagination?.total || 0);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to load tenants');
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card className={styles.card}>
      <header className={styles.cardHead}>
        <div>
          <h3 className={styles.cardTitle}>Tenants</h3>
          <p className={styles.cardSub}>
            Click a tenant to edit telephony mode, billing mode, BYO Exotel accounts, rate
            overrides, monthly cap, and manage their call credit wallet.
          </p>
        </div>
        <SearchInput
          value={search}
          onSearch={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search by name or slug (Enter)"
        />
      </header>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Tenant</TableHeaderCell>
            <TableHeaderCell>Account mode</TableHeaderCell>
            <TableHeaderCell>Billing mode</TableHeaderCell>
            <TableHeaderCell>Industry</TableHeaderCell>
            <TableHeaderCell>Created</TableHeaderCell>
            <TableHeaderCell aria-label="Open" />
          </TableRow>
        </TableHead>
        <TableBody>
          {tenants.map((t) => (
            <TableRow key={t.id} className={styles.clickableRow} onClick={() => onOpenTenant(t)}>
              <TableCell>
                <div className={styles.tenantCell}>
                  <strong>{t.name}</strong>
                  <span className={styles.muted}>#{t.id} · {t.slug}</span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={t.telephony_account_mode === 'byo_account' ? 'success' : 'default'}>
                  {t.telephony_account_mode === 'byo_account' ? 'BYO' : 'Default'}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={t.call_billing_mode === 'unlimited' ? 'success' : 'warning'}>
                  {t.call_billing_mode || 'credit'}
                </Badge>
              </TableCell>
              <TableCell>{t.industry_name || '—'}</TableCell>
              <TableCell>{t.created_at}</TableCell>
              <TableCell>
                <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); onOpenTenant(t); }}>
                  Edit
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!tenants.length && !loading && <p className={styles.muted}>No tenants found.</p>}
      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        limit={PAGE_SIZE}
        onPageChange={(p) => { if (!loading) setPage(p); }}
        hidePageSize
      />
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */
export function PlatformTenantTelephonyPage() {
  const [error, setError] = useState(null);
  const [editingTenant, setEditingTenant] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Telephony billing & credits"
        subtitle="Manage platform-wide default rates, per-tenant telephony mode, billing mode (credit / unlimited with monthly cap), rate overrides, BYO provider accounts, and call credit wallets."
      />

      {error ? <Alert variant="error" className={styles.topAlert}>{error}</Alert> : null}

      <PlatformDefaultsCard onError={setError} />

      <TenantBillingList
        refreshKey={refreshKey}
        onOpenTenant={setEditingTenant}
      />

      <TenantBillingEditModal
        tenant={editingTenant}
        isOpen={!!editingTenant}
        onClose={() => setEditingTenant(null)}
        onSaved={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}
