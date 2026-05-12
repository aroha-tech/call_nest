import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Checkbox } from '../components/ui/Checkbox';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeaderCell,
} from '../components/ui/Table';
import { Pagination } from '../components/ui/Pagination';
import { tenantTelephonyAPI } from '../services/tenantTelephonyAPI';
import { useDateTimeDisplay } from '../hooks/useDateTimeDisplay';
import { usePermissions } from '../hooks/usePermission';
import { PERMISSIONS } from '../utils/permissionUtils';
import styles from './TenantTelephonyPage.module.scss';

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

const ACCOUNT_MODE_OPTIONS = [
  { value: 'default_account', label: 'Default account (platform Exotel)' },
  { value: 'byo_account', label: 'BYO account (your own Exotel)' },
];

const BILLING_MODE_OPTIONS = [
  { value: 'credit', label: 'Credit (pay per connected minute)' },
  { value: 'unlimited', label: 'Unlimited (subscription-covered)' },
];

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

/* -------------------------------------------------------------------------- */
/* Top status banner: shows credit balance OR unlimited cap + always usage    */
/* -------------------------------------------------------------------------- */
function StatusBanner({ balance, usage }) {
  if (!balance) return null;
  const cfg = balance.config;
  const wallet = balance.wallet;
  const isCredit = cfg?.callBillingMode === 'credit';
  const cap = usage?.unlimited_cap;

  return (
    <Card className={styles.bannerCard}>
      <div className={styles.bannerGrid}>
        {isCredit ? (
          <>
            <div className={`${styles.bannerCell} ${styles.bannerCellHero}`}>
              <div className={styles.bannerLabel}>Wallet balance</div>
              <div className={styles.bannerValue}>{formatPaiseAsInr(wallet?.balance_paise)}</div>
              <div className={styles.bannerFoot}>
                Applied rate {formatPaiseAsInr(cfg.ratePaisePerMinute)} / min
                {cfg.isBYO ? ' (BYO platform fee)' : ''}
                {Number(wallet?.balance_paise) < cfg.minBalancePaise ? (
                  <span className={styles.warn}>
                    {' '}· below minimum {formatPaiseAsInr(cfg.minBalancePaise)} — new calls blocked
                  </span>
                ) : null}
              </div>
            </div>
            <div className={styles.bannerCell}>
              <div className={styles.bannerLabel}>This month spend</div>
              <div className={styles.bannerValue}>
                {formatPaiseAsInr(usage?.this_month?.spend_paise || 0)}
              </div>
              <div className={styles.bannerFoot}>
                {formatMinutes(usage?.this_month?.minutes || 0)} ·{' '}
                {usage?.this_month?.calls || 0} calls
              </div>
            </div>
          </>
        ) : (
          <>
            <div className={`${styles.bannerCell} ${styles.bannerCellHero}`}>
              <div className={styles.bannerLabel}>Plan</div>
              <div className={styles.bannerValue}>
                Unlimited calling
                {cap?.enabled ? (
                  <span className={styles.dim}>
                    {' '}· cap {cap.cap_minutes_per_month} min / month
                  </span>
                ) : (
                  <span className={styles.dim}> · no cap</span>
                )}
              </div>
              {cap?.enabled ? (
                <div className={styles.bannerFoot}>
                  <span className={cap.exceeded ? styles.warn : ''}>
                    {cap.used_minutes} / {cap.cap_minutes_per_month} min used (
                    {cap.used_pct}%)
                  </span>
                  <div className={styles.capBar}>
                    <div
                      className={cap.exceeded ? styles.capBarFillOver : styles.capBarFill}
                      style={{ width: `${Math.min(100, cap.used_pct || 0)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className={styles.bannerFoot}>
                  Usage is tracked but no monthly cap is configured.
                </div>
              )}
            </div>
            <div className={styles.bannerCell}>
              <div className={styles.bannerLabel}>This month</div>
              <div className={styles.bannerValue}>
                {formatMinutes(usage?.this_month?.minutes || 0)}
              </div>
              <div className={styles.bannerFoot}>{usage?.this_month?.calls || 0} connected calls</div>
            </div>
          </>
        )}

        <div className={styles.bannerCell}>
          <div className={styles.bannerLabel}>Today</div>
          <div className={styles.bannerValue}>
            {formatMinutes(usage?.today?.minutes || 0)}
          </div>
          <div className={styles.bannerFoot}>{usage?.today?.calls || 0} connected calls</div>
        </div>
        <div className={styles.bannerCell}>
          <div className={styles.bannerLabel}>Last 30 days</div>
          <div className={styles.bannerValue}>
            {formatMinutes(usage?.last_30d?.minutes || 0)}
          </div>
          <div className={styles.bannerFoot}>{usage?.last_30d?.calls || 0} connected calls</div>
        </div>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Modes card                                                                 */
/* -------------------------------------------------------------------------- */
function ModesCard({ mode, canManage, onSaved, onError }) {
  const [draft, setDraft] = useState(mode);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(mode), [mode]);

  async function save() {
    setSaving(true);
    try {
      await tenantTelephonyAPI.updateMode({
        telephony_account_mode: draft.telephony_account_mode,
        call_billing_mode: draft.call_billing_mode,
      });
      onSaved?.();
    } catch (e) {
      onError(e?.response?.data?.error || e.message || 'Failed to save modes');
    } finally {
      setSaving(false);
    }
  }

  if (!draft) return null;

  return (
    <Card className={styles.card}>
      <header className={styles.cardHead}>
        <div>
          <h3 className={styles.cardTitle}>Account &amp; billing mode</h3>
          <p className={styles.cardSub}>
            Choose whether calls use the platform's Exotel account or your own (BYO), and how you
            want to pay. Switching to BYO requires at least one active provider account below.
          </p>
        </div>
      </header>

      <div className={styles.formGrid}>
        <Select
          label="Telephony account mode"
          value={draft.telephony_account_mode}
          options={ACCOUNT_MODE_OPTIONS}
          disabled={!canManage}
          onChange={(e) =>
            setDraft((d) => ({ ...d, telephony_account_mode: e.target.value }))
          }
        />
        <Select
          label="Call billing mode"
          value={draft.call_billing_mode}
          options={BILLING_MODE_OPTIONS}
          disabled={!canManage}
          onChange={(e) => setDraft((d) => ({ ...d, call_billing_mode: e.target.value }))}
        />
      </div>

      {canManage ? (
        <div className={styles.cardActions}>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save modes'}
          </Button>
        </div>
      ) : (
        <p className={styles.muted}>
          Read-only. Ask a super-admin to change these from the platform Telephony &amp; Credits
          page.
        </p>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Provider accounts CRUD                                                     */
/* -------------------------------------------------------------------------- */
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

function ProviderAccountsCard({ canView, canManage, onChanged, onError }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(BLANK_ACCOUNT_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const res = await tenantTelephonyAPI.listAccounts({ include_inactive: '1' });
      setAccounts(res.data?.data || []);
    } catch (e) {
      onError(e?.response?.data?.error || e.message || 'Failed to load provider accounts');
    } finally {
      setLoading(false);
    }
  }, [canView, onError]);

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
        body.provider_code = 'exotel';
        body.credentials = creds;
        await tenantTelephonyAPI.createAccount(body);
      } else {
        if (hasAnyCred) body.credentials = creds;
        await tenantTelephonyAPI.updateAccount(editingId, body);
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
    if (
      !confirm(
        'Rotate the webhook token for this account? Any pending Exotel webhook callbacks using the old token will fail until Exotel is reconfigured.'
      )
    )
      return;
    try {
      await tenantTelephonyAPI.rotateAccountWebhookToken(acc.id);
      await load();
    } catch (e) {
      onError(e?.response?.data?.error || e.message || 'Rotate failed');
    }
  }

  async function remove(acc) {
    if (
      !confirm(
        `Soft-delete provider account "${acc.label}"? It will be disabled immediately. If you remove your only active account, calls will fall back to the platform default Exotel account.`
      )
    )
      return;
    try {
      await tenantTelephonyAPI.deleteAccount(acc.id);
      await load();
      onChanged?.();
    } catch (e) {
      onError(e?.response?.data?.error || e.message || 'Delete failed');
    }
  }

  if (!canView) return null;

  return (
    <Card className={styles.card}>
      <header className={styles.cardHead}>
        <div>
          <h3 className={styles.cardTitle}>Provider accounts (BYO Exotel)</h3>
          <p className={styles.cardSub}>
            Plug in your own Exotel credentials so outbound calls go through your account. Required
            when you switch to <strong>BYO</strong> mode.
          </p>
        </div>
        {canManage ? <Button size="sm" onClick={openNew}>+ Add account</Button> : null}
      </header>

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
              {canManage ? <TableHeaderCell aria-label="Actions" /> : null}
            </TableRow>
          </TableHead>
          <TableBody>
            {accounts.map((acc) => (
              <TableRow key={acc.id}>
                <TableCell>
                  <div className={styles.cellStack}>
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
                {canManage ? (
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
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {!accounts.length && !loading ? (
        <p className={styles.muted}>
          No BYO provider accounts configured. While none are configured, your workspace uses the
          platform Exotel account.
        </p>
      ) : null}

      {showForm && canManage ? (
        <Card className={`${styles.opCard} ${styles.accountFormCard}`}>
          <div className={styles.opTitle}>
            {editingId == null ? 'Add provider account' : `Edit account #${editingId}`}
          </div>
          <div className={styles.formGrid}>
            <Input
              label="Label *"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="e.g. Acme Exotel primary"
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
              type="password"
              value={form.credentials.exotel_api_key}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  credentials: { ...f.credentials, exotel_api_key: e.target.value },
                }))
              }
            />
            <Input
              label="API Token"
              type="password"
              value={form.credentials.exotel_api_token}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  credentials: { ...f.credentials, exotel_api_token: e.target.value },
                }))
              }
            />
          </div>
          <div className={styles.toggleRow}>
            <Checkbox
              label="Active"
              checked={!!form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            <Checkbox
              label="Default (preferred) account"
              checked={!!form.is_default}
              onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
            />
          </div>
          <div className={styles.cardActions}>
            <Button variant="secondary" onClick={closeForm} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : editingId == null ? 'Create account' : 'Save changes'}
            </Button>
          </div>
        </Card>
      ) : null}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Ledger (read-only)                                                         */
/* -------------------------------------------------------------------------- */
function LedgerCard({ canView, onError }) {
  const { formatDateTime } = useDateTimeDisplay();
  const [ledger, setLedger] = useState({ rows: [], page: 1, total: 0, limit: 10 });
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (page = 1) => {
      if (!canView) return;
      setBusy(true);
      try {
        const res = await tenantTelephonyAPI.listLedger({ page, limit: 10 });
        setLedger({
          rows: res.data?.data?.rows || [],
          page: res.data?.data?.page || page,
          total: res.data?.data?.total || 0,
          limit: res.data?.data?.limit || 10,
        });
      } catch (e) {
        onError(e?.response?.data?.error || e.message || 'Failed to load ledger');
      } finally {
        setBusy(false);
      }
    },
    [canView, onError]
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil((ledger.total || 0) / (ledger.limit || 10)));

  if (!canView) return null;

  return (
    <Card className={styles.card}>
      <header className={styles.cardHead}>
        <div>
          <h3 className={styles.cardTitle}>Wallet ledger</h3>
          <p className={styles.cardSub}>
            Every credit and debit on your call credit wallet. Top-ups are added by the platform
            super-admin.
          </p>
        </div>
      </header>
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
      {!ledger.rows.length && !busy ? <p className={styles.muted}>No ledger entries yet.</p> : null}
      <Pagination
        page={ledger.page}
        totalPages={totalPages}
        total={ledger.total}
        limit={ledger.limit}
        onPageChange={(p) => { if (!busy) void load(p); }}
        hidePageSize
      />
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */
export function TenantTelephonyPage() {
  const { can } = usePermissions();
  const canManageAccounts = can(PERMISSIONS.TELEPHONY_ACCOUNTS_MANAGE) || can(PERMISSIONS.SETTINGS_MANAGE);
  const canViewAccounts =
    canManageAccounts || can(PERMISSIONS.TELEPHONY_ACCOUNTS_VIEW);
  const canViewCredits = can(PERMISSIONS.BILLING_CREDITS_VIEW) || can(PERMISSIONS.SETTINGS_MANAGE);
  const canManageMode = can(PERMISSIONS.SETTINGS_MANAGE) || canManageAccounts;

  const [error, setError] = useState(null);
  const [mode, setMode] = useState(null);
  const [balance, setBalance] = useState(null);
  const [usage, setUsage] = useState(null);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [modeRes, balRes, usageRes] = await Promise.all([
        tenantTelephonyAPI.getMode().catch(() => null),
        canViewCredits ? tenantTelephonyAPI.getBalance().catch(() => null) : null,
        canViewCredits ? tenantTelephonyAPI.getUsage().catch(() => null) : null,
      ]);
      if (modeRes?.data?.data) setMode(modeRes.data.data);
      if (balRes?.data?.data) setBalance(balRes.data.data);
      if (usageRes?.data?.data) setUsage(usageRes.data.data);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to load telephony settings');
    }
  }, [canViewCredits]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Telephony & calls"
        subtitle="Bring your own Exotel account, view your call credit wallet or unlimited-mode usage, and switch between billing modes."
      />

      {error ? (
        <Alert variant="error" className={styles.topAlert}>
          {error}
        </Alert>
      ) : null}

      {canViewCredits ? <StatusBanner balance={balance} usage={usage} /> : null}

      {mode ? (
        <ModesCard
          mode={mode}
          canManage={canManageMode}
          onSaved={loadAll}
          onError={setError}
        />
      ) : null}

      <ProviderAccountsCard
        canView={canViewAccounts}
        canManage={canManageAccounts}
        onChanged={loadAll}
        onError={setError}
      />

      {canViewCredits && balance?.config?.callBillingMode === 'credit' ? (
        <LedgerCard canView={canViewCredits} onError={setError} />
      ) : null}
    </div>
  );
}
