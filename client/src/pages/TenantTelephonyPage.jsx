import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Checkbox } from '../components/ui/Checkbox';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { MaterialSymbol } from '../components/ui/MaterialSymbol';
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
import { formatMinutes, formatPaiseAsInr } from '../utils/callCreditsDisplay';
import { CreditPurchaseSection } from '../components/telephony/CreditPurchaseSection';
import { useAppSelector } from '../app/hooks';
import { selectUser } from '../features/auth/authSelectors';
import styles from './TenantTelephonyPage.module.scss';

const ACCOUNT_MODE_OPTIONS = [
  { value: 'default_account', label: 'Platform Exotel (we manage the account)' },
  { value: 'byo_account', label: 'Your Exotel account (bring your own)' },
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

function accountModeLabel(value) {
  return value === 'byo_account'
    ? 'Your Exotel account (BYO)'
    : 'Platform Exotel (managed for you)';
}

function billingModeLabel(value) {
  return value === 'unlimited'
    ? 'Unlimited (included in subscription)'
    : 'Pay per connected minute (credits)';
}

/* -------------------------------------------------------------------------- */
/* Layout helpers                                                             */
/* -------------------------------------------------------------------------- */
function TelephonySection({ tone, icon, title, hint, headActions, children }) {
  return (
    <Card className={styles.sectionCard}>
      <header className={styles.sectionHead}>
        <div
          className={`${styles.sectionIconWell} ${styles[`sectionIcon_${tone}`]}`.trim()}
        >
          <MaterialSymbol name={icon} className={styles.sectionIconGlyph} />
        </div>
        <div className={styles.sectionHeadText}>
          <h2 className={styles.sectionTitle}>{title}</h2>
          {hint ? <p className={styles.sectionHint}>{hint}</p> : null}
        </div>
        {headActions ? <div className={styles.sectionHeadActions}>{headActions}</div> : null}
      </header>
      <div className={styles.sectionBody}>{children}</div>
    </Card>
  );
}

function StatTile({ icon, label, value, foot, hero = false }) {
  return (
    <div className={`${styles.statTile} ${hero ? styles.statTileHero : ''}`.trim()}>
      <div className={styles.statTileIcon} aria-hidden>
        <MaterialSymbol name={icon} size="sm" />
      </div>
      <div className={styles.statTileContent}>
        <p className={styles.statLabel}>{label}</p>
        <div className={styles.statValue}>{value}</div>
        {foot ? <div className={styles.statFoot}>{foot}</div> : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* At-a-glance setup summary                                                  */
/* -------------------------------------------------------------------------- */
function formatPlanCap(plan) {
  if (!plan || plan.plan_type !== 'unlimited') return null;
  const cap = Number(plan.unlimited_minutes_cap_per_month);
  return cap > 0 ? `${cap.toLocaleString('en-IN')} min / month cap` : 'No monthly cap';
}

function SetupOverview({ mode, balance, canSelfTopUp }) {
  if (!mode) return null;

  const cfg = balance?.config;
  const wallet = balance?.wallet;
  const plan = mode?.billing_plan || cfg?.billingPlan || null;
  const isCredit = (plan?.plan_type || mode.call_billing_mode) === 'credit';
  const isBYO = mode.telephony_account_mode === 'byo_account';
  const belowMin =
    isCredit &&
    cfg &&
    Number(wallet?.balance_paise) < Number(cfg.minBalancePaise || 0);

  return (
    <Card className={styles.overviewCard}>
      <h2 className={styles.overviewTitle}>Your setup at a glance</h2>
      <div className={styles.overviewGrid}>
        <div className={styles.overviewItem}>
          <div className={`${styles.overviewIcon} ${styles.overviewIcon_route}`} aria-hidden>
            <MaterialSymbol name="settings_phone" size="sm" />
          </div>
          <div className={styles.overviewItemText}>
            <p className={styles.overviewLabel}>How calls connect</p>
            <p className={styles.overviewValue}>{accountModeLabel(mode.telephony_account_mode)}</p>
            <p className={styles.overviewFoot}>
              {isBYO
                ? 'Outbound calls use credentials you add below.'
                : 'Outbound calls use the platform Exotel account — no setup needed.'}
            </p>
          </div>
        </div>

        <div className={styles.overviewItem}>
          <div className={`${styles.overviewIcon} ${styles.overviewIcon_billing}`} aria-hidden>
            <MaterialSymbol name="payments" size="sm" />
          </div>
          <div className={styles.overviewItemText}>
            <p className={styles.overviewLabel}>How you are billed</p>
            <p className={styles.overviewValue}>
              {plan?.name ? plan.name : billingModeLabel(mode.call_billing_mode)}
            </p>
            <p className={styles.overviewFoot}>
              {plan
                ? plan.plan_type === 'credit'
                  ? `${billingModeLabel('credit')} · ${formatPaiseAsInr(cfg?.ratePaisePerMinute)} / min`
                  : `${billingModeLabel('unlimited')}${formatPlanCap(plan) ? ` · ${formatPlanCap(plan)}` : ''}`
                : 'Billing is configured by your platform administrator.'}
            </p>
          </div>
        </div>

        {isCredit && cfg ? (
          <div className={styles.overviewItem}>
            <div className={`${styles.overviewIcon} ${styles.overviewIcon_wallet}`} aria-hidden>
              <MaterialSymbol name="account_balance_wallet" size="sm" />
            </div>
            <div className={styles.overviewItemText}>
              <p className={styles.overviewLabel}>Call credit wallet</p>
              <p className={styles.overviewValue}>{formatPaiseAsInr(wallet?.balance_paise)}</p>
              <p className={styles.overviewFoot}>
                {formatPaiseAsInr(cfg.ratePaisePerMinute)} per connected minute
                {cfg.isBYO ? ' (BYO platform fee)' : ''}
                {belowMin ? (
                  <span className={styles.warn}>
                    {' '}
                    · Below minimum {formatPaiseAsInr(cfg.minBalancePaise)} — new calls blocked
                  </span>
                ) : canSelfTopUp ? (
                  ' · Buy credit packs below or on Plans & billing'
                ) : (
                  ' · Top-ups are added by your platform administrator'
                )}
              </p>
            </div>
          </div>
        ) : null}

        {!isCredit ? (
          <div className={styles.overviewItem}>
            <div className={`${styles.overviewIcon} ${styles.overviewIcon_plan}`} aria-hidden>
              <MaterialSymbol name="all_inclusive" size="sm" />
            </div>
            <div className={styles.overviewItemText}>
              <p className={styles.overviewLabel}>Calling plan</p>
              <p className={styles.overviewValue}>Unlimited connected minutes</p>
              <p className={styles.overviewFoot}>Usage is tracked; monthly caps may apply.</p>
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Usage & spending                                                           */
/* -------------------------------------------------------------------------- */
function UsageSection({ balance, usage }) {
  if (!balance) return null;

  const cfg = balance.config;
  const wallet = balance.wallet;
  const isCredit = cfg?.callBillingMode === 'credit';
  const cap = usage?.unlimited_cap;

  return (
    <TelephonySection
      tone="indigo"
      icon="monitoring"
      title="Usage & spending"
      hint="Live numbers for your workspace. Credit mode shows wallet balance and spend; unlimited mode shows plan usage and caps."
    >
      <div className={styles.statsGrid}>
        {isCredit ? (
          <>
            <StatTile
              hero
              icon="account_balance_wallet"
              label="Wallet balance"
              value={formatPaiseAsInr(wallet?.balance_paise)}
              foot={
                <>
                  Rate {formatPaiseAsInr(cfg.ratePaisePerMinute)} / min
                  {cfg.isBYO ? ' (BYO fee)' : ''}
                  {Number(wallet?.balance_paise) < cfg.minBalancePaise ? (
                    <span className={styles.warn}>
                      {' '}
                      · Below minimum {formatPaiseAsInr(cfg.minBalancePaise)} — calls blocked
                    </span>
                  ) : null}
                </>
              }
            />
            <StatTile
              icon="calendar_month"
              label="This month"
              value={formatPaiseAsInr(usage?.this_month?.spend_paise || 0)}
              foot={
                <>
                  {formatMinutes(usage?.this_month?.minutes || 0)} ·{' '}
                  {usage?.this_month?.calls || 0} calls
                </>
              }
            />
          </>
        ) : (
          <>
            <StatTile
              hero
              icon="all_inclusive"
              label="Your plan"
              value={
                <>
                  Unlimited calling
                  {cap?.enabled ? (
                    <span className={styles.dim}>
                      {' '}
                      · {cap.cap_minutes_per_month} min / month cap
                    </span>
                  ) : (
                    <span className={styles.dim}> · no monthly cap</span>
                  )}
                </>
              }
              foot={
                cap?.enabled ? (
                  <>
                    <span className={cap.exceeded ? styles.warn : ''}>
                      {cap.used_minutes} / {cap.cap_minutes_per_month} min used ({cap.used_pct}
                      %)
                    </span>
                    <div className={styles.capBar}>
                      <div
                        className={cap.exceeded ? styles.capBarFillOver : styles.capBarFill}
                        style={{ width: `${Math.min(100, cap.used_pct || 0)}%` }}
                      />
                    </div>
                  </>
                ) : (
                  'Usage is tracked; no monthly cap is configured.'
                )
              }
            />
            <StatTile
              icon="calendar_month"
              label="This month"
              value={formatMinutes(usage?.this_month?.minutes || 0)}
              foot={`${usage?.this_month?.calls || 0} connected calls`}
            />
          </>
        )}

        <StatTile
          icon="today"
          label="Today"
          value={formatMinutes(usage?.today?.minutes || 0)}
          foot={`${usage?.today?.calls || 0} connected calls`}
        />
        <StatTile
          icon="date_range"
          label="Last 30 days"
          value={formatMinutes(usage?.last_30d?.minutes || 0)}
          foot={`${usage?.last_30d?.calls || 0} connected calls`}
        />
      </div>
    </TelephonySection>
  );
}

/* -------------------------------------------------------------------------- */
/* How calls connect                                                          */
/* -------------------------------------------------------------------------- */
function ConnectionSection({ mode, canManageAccountMode, onSaved, onError }) {
  const [draft, setDraft] = useState(mode);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(mode), [mode]);

  async function save() {
    if (!canManageAccountMode) return;
    setSaving(true);
    try {
      await tenantTelephonyAPI.updateMode({
        telephony_account_mode: draft.telephony_account_mode,
      });
      onSaved?.();
    } catch (e) {
      onError(e?.response?.data?.error || e.message || 'Failed to save account mode');
    } finally {
      setSaving(false);
    }
  }

  if (!draft) return null;

  const isBYO = draft.telephony_account_mode === 'byo_account';

  return (
    <TelephonySection
      tone="violet"
      icon="settings_phone"
      title="How calls connect"
      hint="Choose whether outbound calls use the platform’s shared Exotel account or your own Exotel credentials. Switching to BYO requires at least one active provider account in the section below."
    >
      <div className={styles.formGrid}>
        <Select
          label="Call routing"
          value={draft.telephony_account_mode}
          options={ACCOUNT_MODE_OPTIONS}
          disabled={!canManageAccountMode}
          onChange={(e) =>
            setDraft((d) => ({ ...d, telephony_account_mode: e.target.value }))
          }
        />
      </div>

      {isBYO ? (
        <Alert variant="info">
          BYO mode is selected. Add and activate at least one Exotel account below before placing
          calls.
        </Alert>
      ) : (
        <p className={styles.muted}>
          Platform mode is the simplest option — no Exotel credentials are required on your side.
        </p>
      )}

      <div className={styles.billingInfoBox}>
        <div className={styles.billingInfoIcon} aria-hidden>
          <MaterialSymbol name="admin_panel_settings" size="sm" />
        </div>
        <div>
          <p className={styles.billingInfoTitle}>
            Billing: {billingModeLabel(draft.call_billing_mode)}
          </p>
          <p className={styles.billingInfoDesc}>
            Your platform administrator assigns the billing plan and rates. Contact them to change
            plan or switch between credit and unlimited billing.
          </p>
        </div>
      </div>

      {canManageAccountMode ? (
        <div className={styles.cardActions}>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save call routing'}
          </Button>
        </div>
      ) : (
        <p className={styles.muted}>
          Read-only. Ask an administrator with telephony settings access to change call routing.
        </p>
      )}
    </TelephonySection>
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

function ProviderAccountsSection({ canView, canManage, onChanged, onError }) {
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
    <TelephonySection
      tone="blue"
      icon="hub"
      title="Your Exotel accounts (BYO)"
      hint="Only needed when call routing is set to your own Exotel. Add credentials so outbound calls and webhooks run through your Exotel workspace."
      headActions={
        canManage ? (
          <Button size="sm" onClick={openNew}>
            <MaterialSymbol name="add" size="sm" /> Add account
          </Button>
        ) : null
      }
    >
      {loading && !accounts.length ? (
        <p className={styles.muted}>Loading accounts…</p>
      ) : accounts.length ? (
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
                    <span className={styles.muted}>
                      {acc.credentials_hint || acc.provider_code}
                    </span>
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
      ) : (
        <div className={styles.emptyState}>
          <div className={styles.emptyStateIcon} aria-hidden>
            <MaterialSymbol name="cloud_off" size="md" />
          </div>
          <p className={styles.emptyStateTitle}>No Exotel accounts yet</p>
          <p className={styles.emptyStateText}>
            While you use platform call routing, you do not need BYO accounts. Add one here when
            you switch to your own Exotel account.
          </p>
          {canManage ? (
            <Button size="sm" onClick={openNew}>
              Add your first account
            </Button>
          ) : null}
        </div>
      )}

      {showForm && canManage ? (
        <Card className={styles.opCard}>
          <div className={styles.opTitle}>
            {editingId == null ? 'Add Exotel account' : `Edit account #${editingId}`}
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
    </TelephonySection>
  );
}

/* -------------------------------------------------------------------------- */
/* Ledger (read-only)                                                         */
/* -------------------------------------------------------------------------- */
function LedgerSection({ canView, onError }) {
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
    <TelephonySection
      tone="amber"
      icon="receipt_long"
      title="Wallet transaction history"
      hint="Every credit top-up and per-call debit on your call credit wallet. Top-ups are added by your platform administrator."
    >
      {ledger.rows.length ? (
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
      ) : !busy ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyStateIcon} aria-hidden>
            <MaterialSymbol name="receipt_long" size="md" />
          </div>
          <p className={styles.emptyStateTitle}>No transactions yet</p>
          <p className={styles.emptyStateText}>
            Wallet entries appear here after top-ups or when connected calls are billed.
          </p>
        </div>
      ) : (
        <p className={styles.muted}>Loading…</p>
      )}
      {ledger.rows.length ? (
        <Pagination
          page={ledger.page}
          totalPages={totalPages}
          total={ledger.total}
          limit={ledger.limit}
          onPageChange={(p) => {
            if (!busy) void load(p);
          }}
          hidePageSize
        />
      ) : null}
    </TelephonySection>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */
export function TenantTelephonyPage() {
  const user = useAppSelector(selectUser);
  const { can } = usePermissions();
  const canManageAccounts =
    can(PERMISSIONS.TELEPHONY_ACCOUNTS_MANAGE) || can(PERMISSIONS.SETTINGS_MANAGE);
  const canViewAccounts =
    canManageAccounts || can(PERMISSIONS.TELEPHONY_ACCOUNTS_VIEW);
  const canViewCredits = can(PERMISSIONS.BILLING_CREDITS_VIEW) || can(PERMISSIONS.SETTINGS_MANAGE);
  const canManageAccountMode = canManageAccounts;
  const canPurchaseCredits =
    canViewCredits && can(PERMISSIONS.SETTINGS_MANAGE);

  const [error, setError] = useState(null);
  const [purchaseEligible, setPurchaseEligible] = useState(false);
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

      if (canPurchaseCredits) {
        try {
          const purchaseRes = await tenantTelephonyAPI.getPurchaseConfig();
          setPurchaseEligible(!!purchaseRes.data?.data?.eligible);
        } catch {
          setPurchaseEligible(false);
        }
      } else {
        setPurchaseEligible(false);
      }
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to load telephony settings');
    }
  }, [canViewCredits, canPurchaseCredits]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Telephony & calls"
        titleIcon="call"
        subtitle="Manage how outbound calls connect, view usage, and (when on credit billing) your call wallet."
      />

      {error ? (
        <Alert variant="error" className={styles.topAlert}>
          {error}
        </Alert>
      ) : null}

      {mode ? (
        <SetupOverview
          mode={mode}
          balance={balance}
          canSelfTopUp={
            purchaseEligible &&
            mode.telephony_account_mode === 'default_account' &&
            (mode.call_billing_mode === 'credit' || balance?.config?.callBillingMode === 'credit')
          }
        />
      ) : null}

      {canViewCredits ? <UsageSection balance={balance} usage={usage} /> : null}

      {canViewCredits && mode ? (
        <TelephonySection
          tone="emerald"
          icon="shopping_cart"
          title="Plans & call credits"
          hint="Your assigned billing plan (credit or unlimited). Credit workspaces can also buy wallet top-up packs below when using platform calling."
        >
          <CreditPurchaseSection
            userEmail={user?.email}
            onWalletUpdated={loadAll}
            showBillingLink
          />
        </TelephonySection>
      ) : null}

      {mode ? (
        <ConnectionSection
          mode={mode}
          canManageAccountMode={canManageAccountMode}
          onSaved={loadAll}
          onError={setError}
        />
      ) : null}

      <ProviderAccountsSection
        canView={canViewAccounts}
        canManage={canManageAccounts}
        onChanged={loadAll}
        onError={setError}
      />

      {canViewCredits && balance?.config?.callBillingMode === 'credit' ? (
        <LedgerSection canView={canViewCredits} onError={setError} />
      ) : null}
    </div>
  );
}
