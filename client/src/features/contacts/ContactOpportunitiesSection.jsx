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
import { hasAnyPermission, PERMISSIONS } from '../../utils/permissionUtils';
import styles from './ContactOpportunitiesSection.module.scss';

/**
 * @param {{ contactId: string, contactType: 'lead'|'contact' }} props
 */
export function ContactOpportunitiesSection({ contactId, contactType }) {
  const user = useAppSelector(selectUser);
  const perms = user?.permissions ?? [];

  const canRead = hasAnyPermission(user, [PERMISSIONS.CONTACTS_READ, PERMISSIONS.LEADS_READ], perms);
  const canEdit =
    hasAnyPermission(user, [PERMISSIONS.PIPELINES_MANAGE], perms) ||
    (contactType === 'lead' && hasAnyPermission(user, [PERMISSIONS.LEADS_UPDATE], perms)) ||
    (contactType === 'contact' && hasAnyPermission(user, [PERMISSIONS.CONTACTS_UPDATE], perms));

  const [rows, setRows] = useState([]);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [addOpen, setAddOpen] = useState(false);
  const [dealId, setDealId] = useState('');
  const [stageId, setStageId] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

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

  const dealIdsWithOpp = useMemo(() => new Set(rows.map((r) => String(r.deal_id))), [rows]);

  const addDealOptions = useMemo(
    () =>
      deals
        .filter((d) => d.is_active && !dealIdsWithOpp.has(String(d.id)))
        .map((d) => ({ value: String(d.id), label: d.name })),
    [deals, dealIdsWithOpp]
  );

  const selectedDeal = useMemo(() => deals.find((d) => String(d.id) === dealId), [deals, dealId]);

  useEffect(() => {
    if (!selectedDeal?.stages?.length) {
      setStageId('');
      return;
    }
    setStageId(String(selectedDeal.stages[0].id));
  }, [selectedDeal, dealId]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!dealId || !stageId) return;
    setSaving(true);
    try {
      await opportunitiesAPI.create({
        contact_id: Number(contactId),
        deal_id: Number(dealId),
        stage_id: Number(stageId),
        title: title.trim() || null,
        amount: amount === '' ? null : Number(amount),
      });
      setAddOpen(false);
      setDealId('');
      setTitle('');
      setAmount('');
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

  if (!canRead) return null;

  return (
    <section className={styles.section} aria-labelledby="contact-section-opps">
      <div className={styles.header}>
        <h2 id="contact-section-opps" className={styles.title}>
          Pipeline opportunities
        </h2>
        {canEdit && addDealOptions.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              const first = addDealOptions[0]?.value || '';
              setDealId(first);
              setTitle('');
              setAmount('');
              setAddOpen(true);
            }}
          >
            Add to pipeline
          </Button>
        ) : null}
      </div>
      <p className={styles.desc}>
        At most one opportunity per pipeline for this {contactType === 'lead' ? 'lead' : 'contact'}. Progress % comes from the stage.
      </p>

      {error && (
        <Alert variant="error" style={{ marginBottom: 12 }}>
          {error}
        </Alert>
      )}

      {loading ? <p className={styles.muted}>Loading…</p> : null}

      {!loading && !rows.length ? <p className={styles.muted}>No pipeline opportunities yet.</p> : null}

      {!loading && rows.length > 0 ? (
        <ul className={styles.list}>
          {rows.map((r) => (
            <li key={r.id} className={styles.row}>
              <div>
                <div className={styles.dealLine}>
                  <strong>{r.deal_name}</strong>
                  <span className={styles.muted}> · {r.stage_name}</span>
                </div>
                <div className={styles.meta}>
                  {r.progression_percent != null ? `${r.progression_percent}%` : ''}
                  {r.title ? ` · ${r.title}` : ''}
                  {r.amount != null ? ` · ₹ ${Number(r.amount).toLocaleString()}` : ''}
                </div>
              </div>
              {canEdit ? (
                <div className={styles.rowActions}>
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
        <p className={styles.muted}>All active pipelines already have an opportunity, or you need an admin to create pipelines.</p>
      ) : null}

      {canEdit && !deals.length && !loading ? (
        <p className={styles.muted}>
          No pipelines configured.{' '}
          <Link to="/deals">Deals</Link> (admin).
        </p>
      ) : null}

      {addOpen && (
        <Modal isOpen title="Add to pipeline" onClose={() => !saving && setAddOpen(false)}>
          <form onSubmit={handleAdd}>
            <Select label="Pipeline" value={dealId} onChange={(e) => setDealId(e.target.value)} options={addDealOptions} />
            {selectedDeal?.stages?.length ? (
              <Select
                label="Stage"
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                options={selectedDeal.stages.map((s) => ({
                  value: String(s.id),
                  label: `${s.name} (${s.progression_percent}%)`,
                }))}
              />
            ) : null}
            <Input label="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input label="Amount (optional)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <ModalFooter>
              <Button type="button" variant="ghost" onClick={() => setAddOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={saving} disabled={!dealId || !stageId}>
                Add
              </Button>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {moveOpp && (
        <Modal
          isOpen
          title={`Move — ${moveOpp.deal_name}`}
          onClose={() => !saving && setMoveOpp(null)}
        >
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
        title="Remove opportunity"
        message="Remove this pipeline opportunity from the contact?"
        confirmText="Remove"
        loading={saving}
      />
    </section>
  );
}
