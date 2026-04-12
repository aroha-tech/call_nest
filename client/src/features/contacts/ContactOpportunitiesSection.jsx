import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppSelector } from '../../app/hooks';
import { selectUser } from '../../features/auth/authSelectors';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { Modal, ModalFooter, ConfirmModal } from '../../components/ui/Modal';
import { opportunitiesAPI } from '../../services/opportunitiesAPI';
import { dealsAPI } from '../../services/dealsAPI';
import { tenantUsersAPI } from '../../services/tenantUsersAPI';
import { campaignsAPI } from '../../services/campaignsAPI';
import { hasAnyPermission, PERMISSIONS } from '../../utils/permissionUtils';
import styles from './ContactOpportunitiesSection.module.scss';

const DEAL_TYPE_OPTIONS = [
  { value: 'New Business', label: 'New Business' },
  { value: 'Existing Business', label: 'Existing Business' },
  { value: 'Renewal', label: 'Renewal' },
  { value: 'Upsell', label: 'Upsell' },
  { value: 'Downsell', label: 'Downsell' },
];

const LEAD_SOURCE_OPTIONS = [
  { value: 'Web', label: 'Web' },
  { value: 'Cold Call', label: 'Cold Call' },
  { value: 'Referral', label: 'Referral' },
  { value: 'Campaign', label: 'Campaign' },
  { value: 'Partner', label: 'Partner' },
  { value: 'Trade Show', label: 'Trade Show' },
  { value: 'Social', label: 'Social' },
  { value: 'Other', label: 'Other' },
];

function formatIsoDate(d) {
  if (d == null || d === '') return '';
  const s = typeof d === 'string' ? d.slice(0, 10) : '';
  return s || '';
}

/**
 * @param {{ contactId: string, contactType: 'lead'|'contact', accountName?: string }} props
 */
export function ContactOpportunitiesSection({ contactId, contactType, accountName = '' }) {
  const user = useAppSelector(selectUser);
  const perms = user?.permissions ?? [];

  const canRead = hasAnyPermission(user, [PERMISSIONS.CONTACTS_READ, PERMISSIONS.LEADS_READ], perms);
  const canEdit =
    hasAnyPermission(user, [PERMISSIONS.PIPELINES_MANAGE], perms) ||
    (contactType === 'lead' && hasAnyPermission(user, [PERMISSIONS.LEADS_UPDATE], perms)) ||
    (contactType === 'contact' && hasAnyPermission(user, [PERMISSIONS.CONTACTS_UPDATE], perms));

  const [rows, setRows] = useState([]);
  const [deals, setDeals] = useState([]);
  const [userOptions, setUserOptions] = useState([]);
  const [campaignOptions, setCampaignOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    dealId: '',
    stageId: '',
    title: '',
    amount: '',
    ownerId: '',
    closingDate: '',
    probabilityPercent: '',
    expectedRevenue: '',
    leadSource: '',
    dealType: '',
    nextStep: '',
    description: '',
    campaignId: '',
  });

  const [editOpp, setEditOpp] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const [moveOpp, setMoveOpp] = useState(null);
  const [moveStageId, setMoveStageId] = useState('');
  const [deleteOpp, setDeleteOpp] = useState(null);

  const load = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [opRes, dRes] = await Promise.all([
        opportunitiesAPI.list({ contact_id: contactId }),
        dealsAPI.list({ include_inactive: false }),
      ]);
      setRows(opRes?.data?.data ?? []);
      setDeals(dRes?.data?.data ?? []);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, [contactId, canRead]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [uRes, cRes] = await Promise.all([
          tenantUsersAPI.getAll({ limit: 100, page: 1, includeDisabled: false }).catch(() => null),
          campaignsAPI.list({ limit: 100, page: 1 }).catch(() => null),
        ]);
        if (cancelled) return;
        const users = uRes?.data?.data ?? [];
        setUserOptions(
          users.map((u) => ({
            value: String(u.id),
            label: u.name || u.email || `User #${u.id}`,
          }))
        );
        const camps = cRes?.data?.data ?? [];
        setCampaignOptions(
          camps.map((c) => ({
            value: String(c.id),
            label: c.name || `Campaign #${c.id}`,
          }))
        );
      } catch {
        if (!cancelled) {
          setUserOptions(user?.id ? [{ value: String(user.id), label: user.name || user.email || 'Me' }] : []);
          setCampaignOptions([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.email, user?.name]);

  const dealIdsWithOpp = useMemo(() => new Set(rows.map((r) => String(r.deal_id))), [rows]);

  const addDealOptions = useMemo(
    () =>
      deals
        .filter((d) => d.is_active && !dealIdsWithOpp.has(String(d.id)))
        .map((d) => ({ value: String(d.id), label: d.name })),
    [deals, dealIdsWithOpp]
  );

  const selectedDeal = useMemo(() => deals.find((d) => String(d.id) === form.dealId), [deals, form.dealId]);

  useEffect(() => {
    if (!selectedDeal?.stages?.length) {
      setForm((f) => ({ ...f, stageId: '' }));
      return;
    }
    setForm((f) => ({ ...f, stageId: String(selectedDeal.stages[0].id) }));
  }, [selectedDeal, form.dealId]);

  const ownerChoices = useMemo(() => {
    if (userOptions.length) return userOptions;
    return user?.id ? [{ value: String(user.id), label: user.name || user.email || 'Me' }] : [];
  }, [userOptions, user]);


  function openAdd() {
    const first = addDealOptions[0]?.value || '';
    setForm({
      dealId: first,
      stageId: '',
      title: '',
      amount: '',
      ownerId: user?.id ? String(user.id) : '',
      closingDate: '',
      probabilityPercent: '',
      expectedRevenue: '',
      leadSource: '',
      dealType: '',
      nextStep: '',
      description: '',
      campaignId: '',
    });
    setAddOpen(true);
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.dealId || !form.stageId) return;
    if (!form.ownerId) {
      setError('Deal owner is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await opportunitiesAPI.create({
        contact_id: Number(contactId),
        deal_id: Number(form.dealId),
        stage_id: Number(form.stageId),
        title: form.title.trim() || null,
        amount: form.amount === '' ? null : Number(form.amount),
        owner_id: Number(form.ownerId),
        closing_date: form.closingDate || null,
        probability_percent: form.probabilityPercent === '' ? undefined : Number(form.probabilityPercent),
        expected_revenue: form.expectedRevenue === '' ? null : Number(form.expectedRevenue),
        lead_source: form.leadSource || null,
        deal_type: form.dealType || null,
        next_step: form.nextStep.trim() || null,
        description: form.description.trim() || null,
        campaign_id: form.campaignId ? Number(form.campaignId) : null,
      });
      setAddOpen(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  }

  function openEdit(r) {
    setEditOpp(r);
    setEditForm({
      stageId: String(r.stage_id),
      title: r.title || '',
      amount: r.amount != null ? String(r.amount) : '',
      ownerId: r.owner_id != null ? String(r.owner_id) : user?.id ? String(user.id) : '',
      closingDate: formatIsoDate(r.closing_date),
      probabilityPercent:
        r.probability_percent != null && r.probability_percent !== '' ? String(r.probability_percent) : '',
      expectedRevenue: r.expected_revenue != null ? String(r.expected_revenue) : '',
      leadSource: r.lead_source || '',
      dealType: r.deal_type || '',
      nextStep: r.next_step || '',
      description: r.description || '',
      campaignId: r.campaign_id != null ? String(r.campaign_id) : '',
    });
  }

  async function handleEditSave(e) {
    e.preventDefault();
    if (!editOpp || !editForm) return;
    if (!editForm.ownerId) {
      setError('Deal owner is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await opportunitiesAPI.update(editOpp.id, {
        stage_id: Number(editForm.stageId),
        title: editForm.title.trim() || null,
        amount: editForm.amount === '' ? null : Number(editForm.amount),
        owner_id: Number(editForm.ownerId),
        closing_date: editForm.closingDate || null,
        probability_percent: editForm.probabilityPercent === '' ? null : Number(editForm.probabilityPercent),
        expected_revenue: editForm.expectedRevenue === '' ? null : Number(editForm.expectedRevenue),
        lead_source: editForm.leadSource || null,
        deal_type: editForm.dealType || null,
        next_step: editForm.nextStep.trim() || null,
        description: editForm.description.trim() || null,
        campaign_id: editForm.campaignId ? Number(editForm.campaignId) : null,
      });
      setEditOpp(null);
      setEditForm(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleMove() {
    if (!moveOpp || !moveStageId) return;
    setSaving(true);
    try {
      await opportunitiesAPI.update(moveOpp.id, { stage_id: Number(moveStageId) });
      setMoveOpp(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteOpp) return;
    setSaving(true);
    try {
      await opportunitiesAPI.remove(deleteOpp.id);
      setDeleteOpp(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  }

  const editStageOptions = useMemo(() => {
    if (!editOpp) return [];
    const d = deals.find((x) => String(x.id) === String(editOpp.deal_id));
    return (
      d?.stages?.map((s) => ({
        value: String(s.id),
        label: `${s.name} (${s.progression_percent}%)`,
      })) ?? []
    );
  }, [editOpp, deals]);

  if (!canRead) return null;

  return (
    <section className={styles.section} aria-labelledby="contact-section-opps">
      <div className={styles.header}>
        <h2 id="contact-section-opps" className={styles.title}>
          Deals (pipelines)
        </h2>
        {canEdit && addDealOptions.length > 0 ? (
          <Button type="button" size="sm" variant="secondary" onClick={openAdd}>
            New deal
          </Button>
        ) : null}
      </div>
      <p className={styles.desc}>
        Add a pipeline and stage to track this record on your sales boards (same data as from the dialer &quot;apply
        deal&quot; outcome). One open deal per pipeline for this {contactType === 'lead' ? 'lead' : 'contact'}.
        Probability defaults to the stage&apos;s progress % unless you override it. {accountName ? (
          <>
            {' '}
            <span className={styles.accountLine}>Account: {accountName}</span>
          </>
        ) : null}
      </p>

      {error && (
        <Alert variant="error" style={{ marginBottom: 12 }}>
          {error}
        </Alert>
      )}

      {loading ? <p className={styles.muted}>Loading…</p> : null}

      {!loading && !rows.length ? <p className={styles.muted}>No deals on a pipeline yet.</p> : null}

      {!loading && rows.length > 0 ? (
        <ul className={styles.list}>
          {rows.map((r) => (
            <li key={r.id} className={styles.row}>
              <div>
                <div className={styles.dealLine}>
                  <strong>{r.title || r.deal_name}</strong>
                  <span className={styles.muted}> · {r.deal_name}</span>
                  <span className={styles.muted}> · {r.stage_name}</span>
                </div>
                <div className={styles.meta}>
                  {r.effective_probability != null ? `${Number(r.effective_probability)}%` : ''}
                  {r.amount != null ? ` · ₹ ${Number(r.amount).toLocaleString()}` : ''}
                  {r.expected_revenue != null ? ` · Exp. ₹ ${Number(r.expected_revenue).toLocaleString()}` : ''}
                  {r.closing_date ? ` · Close ${formatIsoDate(r.closing_date)}` : ''}
                  {r.owner_name ? ` · ${r.owner_name}` : ''}
                  {r.campaign_name ? ` · ${r.campaign_name}` : ''}
                </div>
              </div>
              {canEdit ? (
                <div className={styles.rowActions}>
                  <Button type="button" size="sm" variant="ghost" onClick={() => openEdit(r)}>
                    Details
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setMoveOpp(r);
                      setMoveStageId(String(r.stage_id));
                    }}
                  >
                    Move
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setDeleteOpp(r)}>
                    Remove
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {canEdit && !addDealOptions.length && !loading && deals.length > 0 && !rows.length ? (
        <p className={styles.muted}>Every pipeline already has a deal, or add a pipeline under Deals.</p>
      ) : null}

      {canEdit && !deals.length && !loading ? (
        <p className={styles.muted}>
          No pipelines configured.{' '}
          <Link to="/deals">Deals</Link> (admin).
        </p>
      ) : null}

      {addOpen && (
        <Modal isOpen title="New deal" onClose={() => !saving && setAddOpen(false)} size="lg">
          <form onSubmit={handleAdd}>
            <h3 className={styles.subsectionTitle}>Deal information</h3>
            <div className={styles.formGrid}>
              <Select
                label="Pipeline"
                value={form.dealId}
                onChange={(e) => setForm((f) => ({ ...f, dealId: e.target.value }))}
                options={addDealOptions}
                required
              />
              {selectedDeal?.stages?.length ? (
                <Select
                  label="Stage"
                  value={form.stageId}
                  onChange={(e) => setForm((f) => ({ ...f, stageId: e.target.value }))}
                  options={selectedDeal.stages.map((s) => ({
                    value: String(s.id),
                    label: `${s.name} (${s.progression_percent}%)`,
                  }))}
                  required
                />
              ) : null}
              <Input
                label="Deal name"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Acme — Enterprise plan"
              />
              <Select
                label="Deal owner"
                value={form.ownerId}
                onChange={(e) => setForm((f) => ({ ...f, ownerId: e.target.value }))}
                options={ownerChoices}
                placeholder="— Select owner —"
                required
              />
              <Input
                label="Amount (₹)"
                type="number"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                step="0.01"
                min={0}
              />
              <Input
                label="Closing date"
                type="date"
                value={form.closingDate}
                onChange={(e) => setForm((f) => ({ ...f, closingDate: e.target.value }))}
              />
              <Input
                label="Probability % (optional override)"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={form.probabilityPercent}
                onChange={(e) => setForm((f) => ({ ...f, probabilityPercent: e.target.value }))}
              />
              <Input
                label="Expected revenue (₹)"
                type="number"
                value={form.expectedRevenue}
                onChange={(e) => setForm((f) => ({ ...f, expectedRevenue: e.target.value }))}
                step="0.01"
                min={0}
              />
              <Select
                label="Type"
                value={form.dealType}
                onChange={(e) => setForm((f) => ({ ...f, dealType: e.target.value }))}
                options={DEAL_TYPE_OPTIONS}
                placeholder="— None —"
                allowEmpty
              />
              <Select
                label="Lead source"
                value={form.leadSource}
                onChange={(e) => setForm((f) => ({ ...f, leadSource: e.target.value }))}
                options={LEAD_SOURCE_OPTIONS}
                placeholder="— None —"
                allowEmpty
              />
              <Input
                label="Next step"
                value={form.nextStep}
                onChange={(e) => setForm((f) => ({ ...f, nextStep: e.target.value }))}
                placeholder="e.g. Send proposal"
              />
              <Select
                label="Campaign"
                value={form.campaignId}
                onChange={(e) => setForm((f) => ({ ...f, campaignId: e.target.value }))}
                options={campaignOptions}
                placeholder="— None —"
                allowEmpty
              />
            </div>
            <h3 className={styles.subsectionTitle}>Description</h3>
            <textarea
              className={styles.textarea}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Notes, context, next actions…"
              rows={4}
            />
            <ModalFooter>
              <Button type="button" variant="ghost" onClick={() => setAddOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={saving} disabled={!form.dealId || !form.stageId || !form.ownerId}>
                Save
              </Button>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {editOpp && editForm && (
        <Modal isOpen title="Deal details" onClose={() => !saving && setEditOpp(null)} size="lg">
          <form onSubmit={handleEditSave}>
            <h3 className={styles.subsectionTitle}>Deal information</h3>
            <div className={styles.formGrid}>
              <Select
                label="Stage"
                value={editForm.stageId}
                onChange={(e) => setEditForm((f) => ({ ...f, stageId: e.target.value }))}
                options={editStageOptions}
                required
              />
              <Input
                label="Deal name"
                value={editForm.title}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
              />
              <Select
                label="Deal owner"
                value={editForm.ownerId}
                onChange={(e) => setEditForm((f) => ({ ...f, ownerId: e.target.value }))}
                options={ownerChoices}
                placeholder="— Select owner —"
                required
              />
              <Input
                label="Amount (₹)"
                type="number"
                value={editForm.amount}
                onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
                step="0.01"
                min={0}
              />
              <Input
                label="Closing date"
                type="date"
                value={editForm.closingDate}
                onChange={(e) => setEditForm((f) => ({ ...f, closingDate: e.target.value }))}
              />
              <Input
                label="Probability % (optional)"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={editForm.probabilityPercent}
                onChange={(e) => setEditForm((f) => ({ ...f, probabilityPercent: e.target.value }))}
              />
              <Input
                label="Expected revenue (₹)"
                type="number"
                value={editForm.expectedRevenue}
                onChange={(e) => setEditForm((f) => ({ ...f, expectedRevenue: e.target.value }))}
                step="0.01"
                min={0}
              />
              <Select
                label="Type"
                value={editForm.dealType}
                onChange={(e) => setEditForm((f) => ({ ...f, dealType: e.target.value }))}
                options={DEAL_TYPE_OPTIONS}
                placeholder="— None —"
                allowEmpty
              />
              <Select
                label="Lead source"
                value={editForm.leadSource}
                onChange={(e) => setEditForm((f) => ({ ...f, leadSource: e.target.value }))}
                options={LEAD_SOURCE_OPTIONS}
                placeholder="— None —"
                allowEmpty
              />
              <Input
                label="Next step"
                value={editForm.nextStep}
                onChange={(e) => setEditForm((f) => ({ ...f, nextStep: e.target.value }))}
              />
              <Select
                label="Campaign"
                value={editForm.campaignId}
                onChange={(e) => setEditForm((f) => ({ ...f, campaignId: e.target.value }))}
                options={campaignOptions}
                placeholder="— None —"
                allowEmpty
              />
            </div>
            <h3 className={styles.subsectionTitle}>Description</h3>
            <textarea
              className={styles.textarea}
              value={editForm.description}
              onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
              rows={4}
            />
            <ModalFooter>
              <Button type="button" variant="ghost" onClick={() => setEditOpp(null)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={saving} disabled={!editForm.ownerId}>
                Save
              </Button>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {moveOpp && (
        <Modal isOpen title={`Move — ${moveOpp.deal_name}`} onClose={() => !saving && setMoveOpp(null)}>
          <Select
            label="Stage"
            value={moveStageId}
            onChange={(e) => setMoveStageId(e.target.value)}
            options={
              deals
                .find((d) => String(d.id) === String(moveOpp.deal_id))
                ?.stages?.map((s) => ({
                  value: String(s.id),
                  label: `${s.name} (${s.progression_percent}%)`,
                })) ?? []
            }
          />
          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => setMoveOpp(null)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" variant="primary" loading={saving} onClick={handleMove}>
              Save
            </Button>
          </ModalFooter>
        </Modal>
      )}

      <ConfirmModal
        isOpen={!!deleteOpp}
        onClose={() => setDeleteOpp(null)}
        onConfirm={handleDelete}
        title="Remove deal"
        message="Remove this deal from the contact?"
        confirmText="Remove"
        loading={saving}
      />
    </section>
  );
}
