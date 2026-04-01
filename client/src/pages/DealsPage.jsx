import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Alert } from '../components/ui/Alert';
import { Spinner } from '../components/ui/Spinner';
import { Modal, ModalFooter, ConfirmModal } from '../components/ui/Modal';
import { dealsAPI } from '../services/dealsAPI';
import { useToast } from '../context/ToastContext';
import styles from './DealsPage.module.scss';

export function DealsPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState('setup');
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [boardDealId, setBoardDealId] = useState('');
  const [boardData, setBoardData] = useState(null);
  const [boardLoading, setBoardLoading] = useState(false);

  const [dealModal, setDealModal] = useState(null);
  const [stageModal, setStageModal] = useState(null);
  const [deleteDeal, setDeleteDeal] = useState(null);
  const [deleteStage, setDeleteStage] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchDeals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await dealsAPI.list({ include_inactive: true });
      const rows = res?.data?.data ?? [];
      setDeals(rows);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (boardDealId) return;
      if (!deals.length) return;
      if (cancelled) return;
      setBoardDealId(String(deals[0].id));
    })();
    return () => {
      cancelled = true;
    };
  }, [deals, boardDealId]);

  const fetchBoard = useCallback(async () => {
    if (!boardDealId) {
      setBoardData(null);
      return;
    }
    setBoardLoading(true);
    try {
      const res = await dealsAPI.getBoard(boardDealId);
      setBoardData(res?.data?.data ?? null);
    } catch (e) {
      showToast(e.response?.data?.error || e.message, 'error');
      setBoardData(null);
    } finally {
      setBoardLoading(false);
    }
  }, [boardDealId, showToast]);

  useEffect(() => {
    if (tab === 'board' && boardDealId) {
      fetchBoard();
    }
  }, [tab, boardDealId, fetchBoard]);

  const dealOptions = useMemo(
    () => deals.filter((d) => d.is_active).map((d) => ({ value: String(d.id), label: d.name })),
    [deals]
  );

  async function saveDeal(e) {
    e?.preventDefault?.();
    if (!dealModal) return;
    const { mode, name, description, is_active } = dealModal;
    if (!String(name || '').trim()) {
      showToast('Name is required', 'warning');
      return;
    }
    setSaving(true);
    try {
      if (mode === 'create') {
        await dealsAPI.create({
          name: name.trim(),
          description: description?.trim() || null,
          is_active: is_active !== false,
        });
        showToast('Pipeline created', 'success');
      } else {
        await dealsAPI.update(dealModal.id, {
          name: name.trim(),
          description: description?.trim() || null,
          is_active: !!is_active,
        });
        showToast('Pipeline updated', 'success');
      }
      setDealModal(null);
      await fetchDeals();
    } catch (err) {
      showToast(err.response?.data?.error || err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function saveStage(e) {
    e?.preventDefault?.();
    if (!stageModal) return;
    const { mode, dealId, stageId, name, progression_percent, is_closed_won, is_closed_lost } = stageModal;
    if (!String(name || '').trim()) {
      showToast('Stage name is required', 'warning');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        progression_percent: progression_percent === '' ? 0 : Number(progression_percent),
        is_closed_won: !!is_closed_won,
        is_closed_lost: !!is_closed_lost,
      };
      if (mode === 'create') {
        await dealsAPI.createStage(dealId, body);
        showToast('Stage added', 'success');
      } else {
        await dealsAPI.updateStage(dealId, stageId, body);
        showToast('Stage updated', 'success');
      }
      setStageModal(null);
      await fetchDeals();
      if (tab === 'board') await fetchBoard();
    } catch (err) {
      showToast(err.response?.data?.error || err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteDeal() {
    if (!deleteDeal) return;
    setSaving(true);
    try {
      await dealsAPI.softDelete(deleteDeal.id);
      showToast('Pipeline deleted', 'success');
      setDeleteDeal(null);
      if (String(boardDealId) === String(deleteDeal.id)) {
        setBoardDealId('');
      }
      await fetchDeals();
    } catch (err) {
      showToast(err.response?.data?.error || err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteStage() {
    if (!deleteStage) return;
    setSaving(true);
    try {
      await dealsAPI.deleteStage(deleteStage.dealId, deleteStage.stageId);
      showToast('Stage removed', 'success');
      setDeleteStage(null);
      await fetchDeals();
      if (tab === 'board') await fetchBoard();
    } catch (err) {
      showToast(err.response?.data?.error || err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function moveStage(dealId, stages, index, direction) {
    const j = index + direction;
    if (j < 0 || j >= stages.length) return;
    const next = [...stages];
    [next[index], next[j]] = [next[j], next[index]];
    const ids = next.map((s) => s.id);
    setSaving(true);
    try {
      await dealsAPI.reorderStages(dealId, ids);
      await fetchDeals();
      if (tab === 'board') await fetchBoard();
    } catch (err) {
      showToast(err.response?.data?.error || err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading && !deals.length) {
    return (
      <div className={styles.page}>
        <PageHeader title="Deals" description="Pipelines, stages, and board" />
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Deals"
        description="Configure pipelines and stages (progress %). View the board by pipeline. One opportunity per contact per pipeline."
        actions={
          <Button type="button" variant="primary" size="sm" onClick={() => setDealModal({ mode: 'create', name: '', description: '', is_active: true })}>
            New pipeline
          </Button>
        }
      />

      {error && <Alert variant="error">{error}</Alert>}

      <div className={styles.tabs}>
        <button type="button" className={`${styles.tab} ${tab === 'setup' ? styles.tabActive : ''}`} onClick={() => setTab('setup')}>
          Pipelines &amp; stages
        </button>
        <button type="button" className={`${styles.tab} ${tab === 'board' ? styles.tabActive : ''}`} onClick={() => setTab('board')}>
          Board
        </button>
      </div>

      {tab === 'setup' && (
        <>
          {!deals.length ? (
            <p className={styles.emptyHint}>No pipelines yet. Create one and add stages.</p>
          ) : null}
          {deals.map((d) => (
            <div key={d.id} className={styles.dealCard}>
              <div className={styles.dealHeader}>
                <div>
                  <h3 className={styles.dealTitle}>
                    {d.name}
                    {!d.is_active ? <span className={styles.emptyHint}> (inactive)</span> : null}
                  </h3>
                  {d.description ? <p className={styles.emptyHint}>{d.description}</p> : null}
                </div>
                <div className={styles.dealActions}>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setDealModal({
                        mode: 'edit',
                        id: d.id,
                        name: d.name,
                        description: d.description || '',
                        is_active: !!d.is_active,
                      })
                    }
                  >
                    Edit pipeline
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setStageModal({ mode: 'create', dealId: d.id, name: '', progression_percent: 0, is_closed_won: false, is_closed_lost: false })}>
                    Add stage
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setDeleteDeal({ id: d.id, name: d.name })}>
                    Delete
                  </Button>
                </div>
              </div>

              {d.stages?.length ? (
                <table className={styles.stageTable}>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Stage</th>
                      <th>Progress %</th>
                      <th>Terminal</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {d.stages.map((s, idx) => (
                      <tr key={s.id}>
                        <td>
                          <Button type="button" size="xs" variant="ghost" disabled={saving} onClick={() => moveStage(d.id, d.stages, idx, -1)} title="Move up">
                            ↑
                          </Button>
                          <Button type="button" size="xs" variant="ghost" disabled={saving} onClick={() => moveStage(d.id, d.stages, idx, 1)} title="Move down">
                            ↓
                          </Button>
                        </td>
                        <td>{s.name}</td>
                        <td>{s.progression_percent}%</td>
                        <td>
                          {s.is_closed_won ? 'Won' : ''}
                          {s.is_closed_lost ? 'Lost' : ''}
                          {!s.is_closed_won && !s.is_closed_lost ? '—' : null}
                        </td>
                        <td>
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            onClick={() =>
                              setStageModal({
                                mode: 'edit',
                                dealId: d.id,
                                stageId: s.id,
                                name: s.name,
                                progression_percent: s.progression_percent,
                                is_closed_won: !!s.is_closed_won,
                                is_closed_lost: !!s.is_closed_lost,
                              })
                            }
                          >
                            Edit
                          </Button>
                          <Button type="button" size="xs" variant="ghost" onClick={() => setDeleteStage({ dealId: d.id, stageId: s.id, name: s.name })}>
                            Remove
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className={styles.emptyHint}>No stages — add at least one.</p>
              )}
            </div>
          ))}
        </>
      )}

      {tab === 'board' && (
        <>
          <div className={styles.boardToolbar}>
            <Select
              label="Pipeline"
              value={boardDealId}
              onChange={(e) => setBoardDealId(e.target.value)}
              options={[{ value: '', label: '— Select —' }, ...dealOptions]}
            />
            <Button type="button" variant="secondary" size="sm" disabled={!boardDealId || boardLoading} onClick={fetchBoard}>
              Refresh
            </Button>
          </div>
          {boardLoading && <Spinner />}
          {!boardLoading && boardData && (
            <div className={styles.boardScroll}>
              {boardData.columns.map((col) => (
                <div key={col.id} className={styles.boardCol}>
                  <div className={styles.boardColTitle}>{col.name}</div>
                  <div className={styles.boardColMeta}>
                    {col.progression_percent}% · {col.opportunities?.length || 0} opps
                  </div>
                  {(col.opportunities || []).map((o) => (
                    <Link
                      key={o.id}
                      to={o.contact_type === 'lead' ? `/leads/${o.contact_id}` : `/contacts/${o.contact_id}`}
                      className={styles.oppCard}
                    >
                      <div className={styles.oppName}>{o.display_name || o.email || `Contact #${o.contact_id}`}</div>
                      {o.title ? <div className={styles.oppMeta}>{o.title}</div> : null}
                      {o.amount != null ? <div className={styles.oppMeta}>₹ {Number(o.amount).toLocaleString()}</div> : null}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {dealModal && (
        <Modal isOpen title={dealModal.mode === 'create' ? 'New pipeline' : 'Edit pipeline'} onClose={() => !saving && setDealModal(null)}>
          <form onSubmit={saveDeal}>
            <Input label="Name" value={dealModal.name} onChange={(e) => setDealModal((p) => ({ ...p, name: e.target.value }))} required />
            <Input label="Description" value={dealModal.description || ''} onChange={(e) => setDealModal((p) => ({ ...p, description: e.target.value }))} />
            <label className={styles.emptyHint} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <input
                type="checkbox"
                checked={!!dealModal.is_active}
                onChange={(e) => setDealModal((p) => ({ ...p, is_active: e.target.checked }))}
              />
              Active
            </label>
            <ModalFooter>
              <Button type="button" variant="ghost" onClick={() => setDealModal(null)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={saving}>
                Save
              </Button>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {stageModal && (
        <Modal isOpen title={stageModal.mode === 'create' ? 'New stage' : 'Edit stage'} onClose={() => !saving && setStageModal(null)}>
          <form onSubmit={saveStage}>
            <Input label="Stage name" value={stageModal.name} onChange={(e) => setStageModal((p) => ({ ...p, name: e.target.value }))} required />
            <Input
              label="Progress % (0–100)"
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={stageModal.progression_percent}
              onChange={(e) => setStageModal((p) => ({ ...p, progression_percent: e.target.value }))}
            />
            <label className={styles.emptyHint} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <input
                type="checkbox"
                checked={!!stageModal.is_closed_won}
                onChange={(e) => setStageModal((p) => ({ ...p, is_closed_won: e.target.checked, is_closed_lost: e.target.checked ? false : p.is_closed_lost }))}
              />
              Closed won
            </label>
            <label className={styles.emptyHint} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <input
                type="checkbox"
                checked={!!stageModal.is_closed_lost}
                onChange={(e) => setStageModal((p) => ({ ...p, is_closed_lost: e.target.checked, is_closed_won: e.target.checked ? false : p.is_closed_won }))}
              />
              Closed lost
            </label>
            <ModalFooter>
              <Button type="button" variant="ghost" onClick={() => setStageModal(null)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={saving}>
                Save
              </Button>
            </ModalFooter>
          </form>
        </Modal>
      )}

      <ConfirmModal
        isOpen={!!deleteDeal}
        onClose={() => setDeleteDeal(null)}
        onConfirm={confirmDeleteDeal}
        title="Delete pipeline"
        message={`Delete "${deleteDeal?.name}"? You must remove opportunities first.`}
        confirmText="Delete"
        loading={saving}
      />

      <ConfirmModal
        isOpen={!!deleteStage}
        onClose={() => setDeleteStage(null)}
        onConfirm={confirmDeleteStage}
        title="Remove stage"
        message={`Remove stage "${deleteStage?.name}"? No opportunities may be in this stage.`}
        confirmText="Remove"
        loading={saving}
      />
    </div>
  );
}
