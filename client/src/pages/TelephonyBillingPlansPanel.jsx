import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Checkbox } from '../components/ui/Checkbox';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { SearchInput } from '../components/ui/SearchInput';
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
import { Modal, ConfirmModal, ModalFooter } from '../components/ui/Modal';
import { IconButton } from '../components/ui/IconButton';
import { EditIcon, PauseIcon, PlayIcon, TrashIcon } from '../components/ui/ActionIcons';
import { telephonyBillingPlansAdminAPI } from '../services/tenantTelephonyAdminAPI';
import {
  formatPaiseAsInr,
  formatPaisePerMinHint,
  formatRupeeAmount,
  paiseToRupeeInput,
  rupeeToPaise,
  safePaisePerMin,
} from '../utils/telephonyMoneyUtils';
import styles from './PlatformTenantTelephonyPage.module.scss';

const PAGE_SIZE = 15;

const PLAN_TYPE_OPTIONS = [
  { value: 'credit', label: 'Credit (pay per minute)' },
  { value: 'unlimited', label: 'Unlimited (usage cap)' },
];

const FILTER_OPTIONS = [
  { value: '', label: 'All plan types' },
  { value: 'credit', label: 'Credit only' },
  { value: 'unlimited', label: 'Unlimited only' },
];

function safeNumber(v) {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

const BLANK_FORM = {
  code: '',
  name: '',
  description: '',
  plan_type: 'credit',
  call_rate_paise_per_minute: '',
  byo_platform_fee_paise_per_minute: '',
  call_min_balance_paise: '',
  unlimited_minutes_cap_per_month: '',
  sort_order: '0',
  is_active: true,
};

function planToForm(row) {
  if (!row) return { ...BLANK_FORM };
  return {
    code: row.code || '',
    name: row.name || '',
    description: row.description || '',
    plan_type: row.plan_type || 'credit',
    call_rate_paise_per_minute:
      row.call_rate_paise_per_minute == null ? '' : String(row.call_rate_paise_per_minute),
    byo_platform_fee_paise_per_minute:
      row.byo_platform_fee_paise_per_minute == null
        ? ''
        : String(row.byo_platform_fee_paise_per_minute),
    call_min_balance_paise:
      row.call_min_balance_paise == null ? '' : paiseToRupeeInput(row.call_min_balance_paise),
    unlimited_minutes_cap_per_month:
      row.unlimited_minutes_cap_per_month == null
        ? ''
        : String(row.unlimited_minutes_cap_per_month),
    sort_order: String(row.sort_order ?? 0),
    is_active: row.is_active === 1 || row.is_active === true,
  };
}

function formToBody(form, { isEdit }) {
  const body = {
    name: String(form.name || '').trim(),
    description: form.description || null,
    plan_type: form.plan_type,
    sort_order: safeNumber(form.sort_order) ?? 0,
    is_active: form.is_active ? 1 : 0,
  };
  if (!isEdit) {
    body.code = String(form.code || '').trim();
  }
  if (form.plan_type === 'credit') {
    body.call_rate_paise_per_minute = safePaisePerMin(form.call_rate_paise_per_minute);
    body.byo_platform_fee_paise_per_minute = safePaisePerMin(form.byo_platform_fee_paise_per_minute);
    body.call_min_balance_paise = rupeeToPaise(form.call_min_balance_paise);
    body.unlimited_minutes_cap_per_month = null;
  } else {
    body.unlimited_minutes_cap_per_month = safeNumber(form.unlimited_minutes_cap_per_month);
    body.call_rate_paise_per_minute = null;
    body.byo_platform_fee_paise_per_minute = null;
    body.call_min_balance_paise = null;
  }
  return body;
}

function PlanTypeBadge({ type }) {
  return (
    <Badge variant={type === 'unlimited' ? 'success' : 'warning'}>
      {type === 'unlimited' ? 'Unlimited' : 'Credit'}
    </Badge>
  );
}

function RatesSummary({ row }) {
  if (row.plan_type === 'credit') {
    return (
      <span className={styles.muted}>
        {row.call_rate_paise_per_minute ?? '—'} paise/min · BYO {row.byo_platform_fee_paise_per_minute ?? '—'}{' '}
        paise/min · min bal {formatPaiseAsInr(row.call_min_balance_paise)}
      </span>
    );
  }
  const cap = Number(row.unlimited_minutes_cap_per_month);
  return (
    <span className={styles.muted}>
      {cap > 0 ? `${cap.toLocaleString('en-IN')} min / month` : 'No monthly cap'}
    </span>
  );
}

export function TelephonyBillingPlansPanel({ onError }) {
  const [plans, setPlans] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [planTypeFilter, setPlanTypeFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const [toggleItem, setToggleItem] = useState(null);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [deleteItem, setDeleteItem] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLocalError(null);
    try {
      const res = await telephonyBillingPlansAdminAPI.list({
        search,
        plan_type: planTypeFilter || undefined,
        include_inactive: showInactive ? 'true' : 'false',
        page,
        limit: PAGE_SIZE,
      });
      setPlans(res.data?.data || []);
      setTotal(res.data?.pagination?.total || 0);
      onError?.(null);
    } catch (e) {
      const msg = e?.response?.data?.error || e.message || 'Failed to load billing plans';
      setLocalError(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }, [search, planTypeFilter, showInactive, page, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isCreditForm = form.plan_type === 'credit';

  const fieldHints = useMemo(
    () => ({
      rate: formatPaisePerMinHint(form.call_rate_paise_per_minute),
      byo: formatPaisePerMinHint(form.byo_platform_fee_paise_per_minute),
      min: formatRupeeAmount(form.call_min_balance_paise),
    }),
    [form]
  );

  function openCreate() {
    setEditing(null);
    setForm(BLANK_FORM);
    setSubmitError(null);
    setModalOpen(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm(planToForm(row));
    setSubmitError(null);
    setModalOpen(true);
  }

  async function savePlan(e) {
    e?.preventDefault?.();
    setSaving(true);
    setSubmitError(null);
    try {
      const body = formToBody(form, { isEdit: !!editing });
      if (!body.name) throw new Error('Name is required');
      if (!editing && !body.code) throw new Error('Code is required');
      if (body.plan_type === 'credit') {
        if (
          body.call_rate_paise_per_minute == null ||
          body.byo_platform_fee_paise_per_minute == null ||
          body.call_min_balance_paise == null
        ) {
          throw new Error('All credit rate fields are required');
        }
      } else if (body.unlimited_minutes_cap_per_month == null) {
        throw new Error('Monthly cap is required (use 0 for no cap)');
      }

      if (editing) {
        await telephonyBillingPlansAdminAPI.update(editing.id, body);
      } else {
        await telephonyBillingPlansAdminAPI.create(body);
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      setSubmitError(e?.response?.data?.error || e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function confirmToggle() {
    if (!toggleItem) return;
    setToggleBusy(true);
    try {
      await telephonyBillingPlansAdminAPI.toggleActive(toggleItem.id);
      setToggleItem(null);
      await load();
    } catch (e) {
      setLocalError(e?.response?.data?.error || e.message || 'Toggle failed');
    } finally {
      setToggleBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteItem) return;
    setDeleteBusy(true);
    try {
      await telephonyBillingPlansAdminAPI.delete(deleteItem.id);
      setDeleteItem(null);
      await load();
    } catch (e) {
      setLocalError(e?.response?.data?.error || e.message || 'Delete failed');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <Card className={styles.card}>
      <header className={styles.cardHead}>
        <div className={styles.sectionCardHeadMain}>
          <span className={styles.sectionCardIcon} aria-hidden>
            <MaterialSymbol name="layers" size="sm" />
          </span>
          <div>
            <h3 className={styles.cardTitle}>Billing plans</h3>
            <p className={styles.cardSub}>
              Reusable templates for credit (pay-per-minute) and unlimited calling. Assign a plan
              to each tenant; per-tenant overrides still apply on top.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={openCreate}>
          <MaterialSymbol name="add" size="sm" /> Add plan
        </Button>
      </header>

      {localError ? <Alert variant="error">{localError}</Alert> : null}

      <div className={styles.plansToolbar}>
        <Select
          label="Plan type"
          value={planTypeFilter}
          options={FILTER_OPTIONS}
          onChange={(e) => {
            setPlanTypeFilter(e.target.value);
            setPage(1);
          }}
        />
        <Checkbox
          label="Show inactive"
          checked={showInactive}
          onChange={(e) => {
            setShowInactive(e.target.checked);
            setPage(1);
          }}
        />
        <SearchInput
          value={search}
          onSearch={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search plans… (Enter)"
          className={styles.plansSearch}
        />
      </div>

      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Plan</TableHeaderCell>
            <TableHeaderCell>Type</TableHeaderCell>
            <TableHeaderCell>Rates / cap</TableHeaderCell>
            <TableHeaderCell>Order</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell aria-label="Actions" />
          </TableRow>
        </TableHead>
        <TableBody>
          {plans.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <div className={styles.cellStack}>
                  <strong>{row.name}</strong>
                  <span className={styles.muted}>{row.code}</span>
                </div>
              </TableCell>
              <TableCell>
                <PlanTypeBadge type={row.plan_type} />
              </TableCell>
              <TableCell>
                <RatesSummary row={row} />
              </TableCell>
              <TableCell>{row.sort_order}</TableCell>
              <TableCell>
                <Badge variant={row.is_active === 1 ? 'success' : 'muted'}>
                  {row.is_active === 1 ? 'Active' : 'Inactive'}
                </Badge>
              </TableCell>
              <TableCell>
                <div className={styles.rowActions}>
                  <IconButton title="Edit" onClick={() => openEdit(row)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    title={row.is_active === 1 ? 'Deactivate' : 'Activate'}
                    variant={row.is_active === 1 ? 'warning' : 'success'}
                    onClick={() => setToggleItem(row)}
                  >
                    {row.is_active === 1 ? <PauseIcon /> : <PlayIcon />}
                  </IconButton>
                  <IconButton title="Delete" variant="danger" onClick={() => setDeleteItem(row)}>
                    <TrashIcon />
                  </IconButton>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {!plans.length && !loading ? (
        <p className={styles.muted}>No billing plans yet. Create credit and unlimited templates.</p>
      ) : null}

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        limit={PAGE_SIZE}
        onPageChange={(p) => {
          if (!loading) setPage(p);
        }}
        hidePageSize
      />

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit billing plan' : 'Create billing plan'}
        size="lg"
        footer={
          <ModalFooter>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={savePlan} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create plan'}
            </Button>
          </ModalFooter>
        }
      >
        <form className={styles.formCol} onSubmit={savePlan}>
          {submitError ? <Alert variant="warning">{submitError}</Alert> : null}
          <div className={styles.formGrid}>
            <Input
              label="Name *"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Credit — Growth"
            />
            <Input
              label="Code *"
              value={form.code}
              disabled={!!editing}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="e.g. credit_growth"
              hint={editing ? 'Code cannot be changed after creation' : 'Lowercase letters, numbers, underscores'}
            />
            <Select
              label="Plan type *"
              value={form.plan_type}
              options={PLAN_TYPE_OPTIONS}
              onChange={(e) => setForm((f) => ({ ...f, plan_type: e.target.value }))}
            />
            <Input
              label="Sort order"
              type="number"
              min={0}
              value={form.sort_order}
              onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
            />
          </div>
          <Input
            label="Description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Shown to tenant admins on the telephony settings page"
          />
          {isCreditForm ? (
            <div className={styles.formGrid}>
              <Input
                label="Call rate (paise / min, default account) *"
                type="number"
                min={0}
                value={form.call_rate_paise_per_minute}
                onChange={(e) =>
                  setForm((f) => ({ ...f, call_rate_paise_per_minute: e.target.value }))
                }
                hint={fieldHints.rate}
              />
              <Input
                label="BYO platform fee (paise / min) *"
                type="number"
                min={0}
                value={form.byo_platform_fee_paise_per_minute}
                onChange={(e) =>
                  setForm((f) => ({ ...f, byo_platform_fee_paise_per_minute: e.target.value }))
                }
                hint={fieldHints.byo}
              />
              <Input
                label="Minimum wallet balance (₹) *"
                type="number"
                min={0}
                step="0.01"
                value={form.call_min_balance_paise}
                onChange={(e) =>
                  setForm((f) => ({ ...f, call_min_balance_paise: e.target.value }))
                }
                hint={fieldHints.min !== '—' ? `${fieldHints.min} required to place calls` : undefined}
              />
            </div>
          ) : (
            <Input
              label="Monthly connected-minute cap *"
              type="number"
              min={0}
              value={form.unlimited_minutes_cap_per_month}
              onChange={(e) =>
                setForm((f) => ({ ...f, unlimited_minutes_cap_per_month: e.target.value }))
              }
              hint="Use 0 for unlimited with no monthly cap"
            />
          )}
          <Checkbox
            label="Active (available for tenant assignment)"
            checked={!!form.is_active}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
          />
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!toggleItem}
        onClose={() => setToggleItem(null)}
        onConfirm={confirmToggle}
        title={toggleItem?.is_active === 1 ? 'Deactivate plan' : 'Activate plan'}
        message={
          toggleItem?.is_active === 1
            ? `Deactivate "${toggleItem?.name}"? Tenants already assigned keep their settings but new assignments will be blocked.`
            : `Activate "${toggleItem?.name}" so it can be assigned to tenants.`
        }
        confirmText={toggleItem?.is_active === 1 ? 'Deactivate' : 'Activate'}
        loading={toggleBusy}
      />

      <ConfirmModal
        isOpen={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={confirmDelete}
        title="Delete billing plan"
        message={`Permanently delete "${deleteItem?.name}"? This fails if any tenant is still assigned.`}
        confirmText="Delete"
        loading={deleteBusy}
      />
    </Card>
  );
}