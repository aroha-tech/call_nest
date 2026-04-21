import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppSelector } from '../app/hooks';
import { selectUser } from '../features/auth/authSelectors';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { EditIcon, TrashIcon, RowActionGroup } from '../components/ui/ActionIcons';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Alert } from '../components/ui/Alert';
import { Spinner } from '../components/ui/Spinner';
import { Modal, ModalFooter, ConfirmModal } from '../components/ui/Modal';
import { dealsAPI } from '../services/dealsAPI';
import { opportunitiesAPI } from '../services/opportunitiesAPI';
import { contactsAPI } from '../services/contactsAPI';
import { tenantUsersAPI } from '../services/tenantUsersAPI';
import { useToast } from '../context/ToastContext';
import styles from './DealsPage.module.scss';

/**
 * Combined value: `${percent}|open|won|lost`.
 * Won/Lost only exist at 100% (closed). Below 100% is always open pipeline weight.
 */
function buildStageProgressOutcomeOptions() {
  const opts = [];
  for (let pct = 10; pct <= 90; pct += 10) {
    opts.push({
      value: `${pct}|open`,
      label: `${pct}% · Open (active pipeline)`,
    });
  }
  opts.push({ value: '100|open', label: '100% · Open (active pipeline)' });
  opts.push({ value: '100|won', label: '100% · Won (closed successfully)' });
  opts.push({ value: '100|lost', label: '100% · Lost (closed / missed)' });
  return opts;
}

const STAGE_PROGRESS_OUTCOME_OPTIONS = buildStageProgressOutcomeOptions();

function progressOutcomeFromStage(s) {
  let won = Number(s?.is_closed_won) === 1 || s?.is_closed_won === true;
  let lost = Number(s?.is_closed_lost) === 1 || s?.is_closed_lost === true;
  if (won && lost) lost = false;
  if (won) return '100|won';
  if (lost) return '100|lost';

  const raw = Number(s?.progression_percent);
  const rounded = Number.isFinite(raw) ? Math.round(raw / 10) * 10 : 10;
  const pct = Math.min(100, Math.max(10, rounded));
  if (pct >= 100) return '100|open';
  return `${pct}|open`;
}

function parseProgressOutcome(v) {
  const str = String(v || '');
  const [a, b] = str.split('|');
  const parsedPct = Math.min(100, Math.max(10, Number(a) || 10));
  const kind = b === 'won' || b === 'lost' ? b : 'open';
  const progression_percent = kind === 'won' || kind === 'lost' ? 100 : parsedPct;
  return {
    progression_percent,
    is_closed_won: kind === 'won',
    is_closed_lost: kind === 'lost',
  };
}

/** Move one opportunity between board columns without refetching (avoids full-board loading flash). */
function moveOppBetweenColumns(prev, oppId, fromStageId, toStageId) {
  if (!prev?.columns?.length) return prev;
  const fromId = String(fromStageId);
  const toId = String(toStageId);
  let moved = null;
  const without = prev.columns.map((col) => {
    if (String(col.id) !== fromId) return col;
    const opps = col.opportunities || [];
    const i = opps.findIndex((o) => Number(o.id) === Number(oppId));
    if (i === -1) return col;
    moved = { ...opps[i], stage_id: Number(toStageId) };
    return {
      ...col,
      opportunities: [...opps.slice(0, i), ...opps.slice(i + 1)],
    };
  });
  if (!moved) return prev;
  return {
    ...prev,
    columns: without.map((col) => {
      if (String(col.id) !== toId) return col;
      return {
        ...col,
        opportunities: [moved, ...(col.opportunities || [])],
      };
    }),
  };
}

export function DealsPage() {
  const user = useAppSelector(selectUser);
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
  const [boardAddModal, setBoardAddModal] = useState(null);
  const [deleteDeal, setDeleteDeal] = useState(null);
  const [deleteStage, setDeleteStage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [draggingStageId, setDraggingStageId] = useState(null);
  const [draggingOppId, setDraggingOppId] = useState(null);
  const [dragOverStageId, setDragOverStageId] = useState(null);
  const [contactSearchLoading, setContactSearchLoading] = useState(false);
  const [contactOptions, setContactOptions] = useState([]);
  const [ownerOptions, setOwnerOptions] = useState([]);

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
  const selectedBoardDeal = useMemo(
    () => deals.find((d) => String(d.id) === String(boardDealId)),
    [deals, boardDealId]
  );
  const ownerChoices = useMemo(() => {
    if (ownerOptions.length) return ownerOptions;
    if (user?.id) return [{ value: String(user.id), label: user.name || user.email || 'Me' }];
    return [];
  }, [ownerOptions, user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await tenantUsersAPI.getAll({ page: 1, limit: 200, includeDisabled: false });
        if (cancelled) return;
        const users = res?.data?.data ?? [];
        setOwnerOptions(
          users.map((u) => ({
            value: String(u.id),
            label: u.name || u.email || '—',
          }))
        );
      } catch {
        if (!cancelled) setOwnerOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    const { mode, dealId, stageId, name, progressOutcome } = stageModal;
    if (!String(name || '').trim()) {
      showToast('Stage name is required', 'warning');
      return;
    }
    const { progression_percent, is_closed_won, is_closed_lost } = parseProgressOutcome(progressOutcome);
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        progression_percent,
        is_closed_won,
        is_closed_lost,
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

  const handleStageDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleStageDragStart = useCallback((e, stageId) => {
    e.dataTransfer.setData('text/plain', String(stageId));
    e.dataTransfer.effectAllowed = 'move';
    setDraggingStageId(stageId);
  }, []);

  const handleStageDragEnd = useCallback(() => {
    setDraggingStageId(null);
  }, []);

  const handleOppDragStart = useCallback((e, oppId, fromStageId) => {
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({ oppId: Number(oppId), fromStageId: Number(fromStageId) })
    );
    e.dataTransfer.effectAllowed = 'move';
    setDraggingOppId(Number(oppId));
  }, []);

  const handleOppDragEnd = useCallback(() => {
    setDraggingOppId(null);
    setDragOverStageId(null);
  }, []);

  const handleOppStageDragOver = useCallback((e, targetStageId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStageId(Number(targetStageId));
  }, []);

  async function handleStageDrop(e, dealId, stages, targetStageId) {
    e.preventDefault();
    setDraggingStageId(null);
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw || String(raw) === String(targetStageId)) return;
    const order = stages.map((s) => s.id);
    const from = order.findIndex((id) => String(id) === String(raw));
    const to = order.findIndex((id) => String(id) === String(targetStageId));
    if (from < 0 || to < 0) return;
    const next = [...order];
    const [removed] = next.splice(from, 1);
    next.splice(to, 0, removed);
    setSaving(true);
    try {
      await dealsAPI.reorderStages(dealId, next);
      await fetchDeals();
      if (tab === 'board') await fetchBoard();
    } catch (err) {
      showToast(err.response?.data?.error || err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleOppDrop(e, targetStageId) {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/json');
    setDragOverStageId(null);
    setDraggingOppId(null);
    if (!raw) return;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const oppId = Number(parsed?.oppId);
    const fromStageId = Number(parsed?.fromStageId);
    if (!oppId || !targetStageId || String(fromStageId) === String(targetStageId)) return;

    const snapshot = boardData;
    setBoardData((prev) => moveOppBetweenColumns(prev, oppId, fromStageId, targetStageId));

    try {
      await opportunitiesAPI.update(oppId, { stage_id: Number(targetStageId) });
      showToast('Deal moved', 'success');
    } catch (err) {
      setBoardData(snapshot);
      showToast(err.response?.data?.error || err.message, 'error');
    }
  }

  function openBoardAddDeal() {
    if (!selectedBoardDeal) return;
    const firstStageId = selectedBoardDeal.stages?.[0]?.id
      ? String(selectedBoardDeal.stages[0].id)
      : '';
    setBoardAddModal({
      dealId: String(selectedBoardDeal.id),
      stageId: firstStageId,
      contactType: 'lead',
      contactSearch: '',
      contactId: '',
      ownerId: user?.id ? String(user.id) : '',
      title: '',
      amount: '',
    });
    setContactOptions([]);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!boardAddModal) return;
      setContactSearchLoading(true);
      try {
        const res = await contactsAPI.getAll({
          type: boardAddModal.contactType,
          search: boardAddModal.contactSearch || undefined,
          page: 1,
          limit: 50,
        });
        if (cancelled) return;
        const rows = res?.data?.data ?? [];
        setContactOptions(
          rows.map((r) => ({
            value: String(r.id),
            label: [
              r.display_name || r.first_name || r.email || `#${r.id}`,
              r.primary_phone || r.email || '',
            ]
              .filter(Boolean)
              .join(' · '),
          }))
        );
      } catch {
        if (!cancelled) setContactOptions([]);
      } finally {
        if (!cancelled) setContactSearchLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardAddModal]);

  async function saveBoardDeal(e) {
    e?.preventDefault?.();
    if (!boardAddModal) return;
    if (!boardAddModal.contactId || !boardAddModal.stageId || !boardAddModal.ownerId) {
      showToast('Contact, stage, and owner are required', 'warning');
      return;
    }
    setSaving(true);
    try {
      await opportunitiesAPI.create({
        contact_id: Number(boardAddModal.contactId),
        deal_id: Number(boardAddModal.dealId),
        stage_id: Number(boardAddModal.stageId),
        owner_id: Number(boardAddModal.ownerId),
        title: boardAddModal.title?.trim() || null,
        amount: boardAddModal.amount === '' ? null : Number(boardAddModal.amount),
      });
      setBoardAddModal(null);
      await fetchBoard();
      showToast('Deal added', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading && !deals.length) {
    return (
      <div className={styles.page}>
        <PageHeader title="Deals" description="Pipelines and board by stage." />
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Deals"
        description="Pipelines and board by stage. Full deal fields stay on each lead or contact."
        actions={
          <Button type="button" variant="primary" size="sm" onClick={() => setDealModal({ mode: 'create', name: '', description: '', is_active: true })}>
            New pipeline
          </Button>
        }
      />

      {error && <Alert variant="error">{error}</Alert>}

      <div className={styles.tabsWrap} role="tablist" aria-label="Deals views">
        <div className={styles.tabs}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'setup'}
            className={`${styles.tab} ${tab === 'setup' ? styles.tabActive : ''}`}
            onClick={() => setTab('setup')}
          >
            Pipelines &amp; stages
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'board'}
            className={`${styles.tab} ${tab === 'board' ? styles.tabActive : ''}`}
            onClick={() => setTab('board')}
          >
            Board
          </button>
        </div>
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
                  <IconButton
                    size="sm"
                    variant="subtle"
                    title="Edit pipeline"
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
                    <EditIcon />
                  </IconButton>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setStageModal({ mode: 'create', dealId: d.id, name: '', progressOutcome: '10|open' })}>
                    Add stage
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setDeleteDeal({ id: d.id, name: d.name })}>
                    Delete
                  </Button>
                </div>
              </div>

              {d.stages?.length ? (
                <div className={styles.stageTableWrap}>
                  <table className={styles.stageTable}>
                    <thead>
                      <tr>
                        <th className={styles.stageOrderCol}>Reorder</th>
                        <th>Stage</th>
                        <th>Forecast</th>
                        <th>Outcome</th>
                        <th className={styles.stageActionsCol} />
                      </tr>
                    </thead>
                    <tbody>
                      {d.stages.map((s) => (
                        <tr
                          key={s.id}
                          className={String(draggingStageId) === String(s.id) ? styles.stageRowDragging : ''}
                          onDragOver={handleStageDragOver}
                          onDrop={(e) => handleStageDrop(e, d.id, d.stages, s.id)}
                        >
                          <td className={styles.stageOrderCol}>
                            <div
                              role="button"
                              tabIndex={0}
                              className={styles.stageDragHandle}
                              draggable={!saving}
                              title="Drag to reorder stages"
                              aria-label={`Drag to reorder ${s.name}`}
                              onDragStart={(e) => handleStageDragStart(e, s.id)}
                              onDragEnd={handleStageDragEnd}
                            >
                              <span className={styles.stageDragGrip} aria-hidden>
                                ⠿
                              </span>
                            </div>
                          </td>
                          <td className={styles.stageNameCell}>{s.name}</td>
                          <td>
                            <span className={styles.stagePctBadge}>
                              {Math.round(Number(s.progression_percent) || 0)}%
                            </span>
                          </td>
                          <td>
                            {Number(s.is_closed_won) === 1 || s.is_closed_won === true ? (
                              <span className={`${styles.outcomePill} ${styles.outcomePillWon}`}>Won</span>
                            ) : Number(s.is_closed_lost) === 1 || s.is_closed_lost === true ? (
                              <span className={`${styles.outcomePill} ${styles.outcomePillLost}`}>Lost</span>
                            ) : (
                              <span className={`${styles.outcomePill} ${styles.outcomePillOpen}`}>Open</span>
                            )}
                          </td>
                          <td className={styles.stageActionsCol}>
                            <RowActionGroup>
                              <IconButton
                                size="sm"
                                title="Edit stage"
                                onClick={() =>
                                  setStageModal({
                                    mode: 'edit',
                                    dealId: d.id,
                                    stageId: s.id,
                                    name: s.name,
                                    progressOutcome: progressOutcomeFromStage(s),
                                  })
                                }
                              >
                              <EditIcon />
                            </IconButton>
                            <IconButton
                              size="sm"
                              variant="danger"
                              title="Remove stage"
                              onClick={() => setDeleteStage({ dealId: d.id, stageId: s.id, name: s.name })}
                            >
                              <TrashIcon />
                            </IconButton>
                            </RowActionGroup>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
            <div className={styles.boardToolbarFields}>
              <Select
                className={styles.boardPipelineSelect}
                label="Pipeline"
                value={boardDealId}
                onChange={(e) => setBoardDealId(e.target.value)}
                options={[{ value: '', label: 'Choose a pipeline…' }, ...dealOptions]}
              />
            </div>
            <div className={styles.boardToolbarActions}>
              <Button type="button" variant="secondary" size="sm" disabled={!selectedBoardDeal} onClick={openBoardAddDeal}>
                New deal
              </Button>
              <Button type="button" variant="secondary" size="sm" disabled={!boardDealId || boardLoading} onClick={fetchBoard}>
                Refresh
              </Button>
            </div>
          </div>
          {boardLoading && <Spinner />}
          {!boardLoading && boardData && (
            <div className={styles.boardRoot}>
              <div className={styles.boardScroll}>
                {boardData.columns.map((col) => (
                  <div key={col.id} className={styles.boardCol}>
                    <div className={styles.boardColHead}>
                      <div className={styles.boardColTitleRow}>
                        <div className={styles.boardColTitle}>{col.name}</div>
                        {Number(col.is_closed_won) === 1 || col.is_closed_won === true ? (
                          <span className={`${styles.boardColOutcome} ${styles.boardColOutcomeWon}`}>Won</span>
                        ) : Number(col.is_closed_lost) === 1 || col.is_closed_lost === true ? (
                          <span className={`${styles.boardColOutcome} ${styles.boardColOutcomeLost}`}>Lost</span>
                        ) : null}
                      </div>
                      <div className={styles.boardColMeta}>
                        <span className={styles.boardColBadge}>{Math.round(Number(col.progression_percent) || 0)}%</span>
                        <span className={styles.boardColCount}>{col.opportunities?.length || 0} deals</span>
                      </div>
                    </div>
                  <div
                    className={`${styles.boardColBody} ${String(dragOverStageId) === String(col.id) ? styles.boardColBodyDropActive : ''}`}
                    onDragOver={(e) => handleOppStageDragOver(e, col.id)}
                    onDragLeave={() => setDragOverStageId((prev) => (String(prev) === String(col.id) ? null : prev))}
                    onDrop={(e) => handleOppDrop(e, col.id)}
                  >
                    {(col.opportunities || []).length === 0 ? (
                      <div className={styles.boardColEmpty}>No deals in this stage</div>
                    ) : null}
                    {(col.opportunities || []).map((o) => (
                      <Link
                        key={o.id}
                        to={o.contact_type === 'lead' ? `/leads/${o.contact_id}` : `/contacts/${o.contact_id}`}
                        className={`${styles.oppCard} ${String(draggingOppId) === String(o.id) ? styles.oppCardDragging : ''}`}
                        draggable={!saving}
                        onDragStart={(e) => handleOppDragStart(e, o.id, col.id)}
                        onDragEnd={handleOppDragEnd}
                      >
                        <div className={styles.oppName}>{o.display_name || o.email || '—'}</div>
                        {o.account_name ? <div className={styles.oppMeta}>{o.account_name}</div> : null}
                        {o.title ? <div className={styles.oppMeta}>{o.title}</div> : null}
                        {o.amount != null ? <div className={styles.oppMeta}>₹ {Number(o.amount).toLocaleString()}</div> : null}
                        {o.expected_revenue != null ? (
                          <div className={styles.oppMeta}>Exp. ₹ {Number(o.expected_revenue).toLocaleString()}</div>
                        ) : null}
                        {o.closing_date ? (
                          <div className={styles.oppMeta}>Close {String(o.closing_date).slice(0, 10)}</div>
                        ) : null}
                        {o.owner_name ? <div className={styles.oppMeta}>{o.owner_name}</div> : null}
                      </Link>
                    ))}
                  </div>
                </div>
                    ))}
              </div>
            </div>
          )}
        </>
      )}

      {dealModal && (
        <Modal
          isOpen
          size="lg"
          title={dealModal.mode === 'create' ? 'New pipeline' : 'Edit pipeline'}
          onClose={() => !saving && setDealModal(null)}
        >
          <form onSubmit={saveDeal} className={styles.modalForm}>
            <p className={styles.modalHint}>
              A pipeline is a template (e.g. “Direct sales”). Stages belong to the pipeline; individual deals are added on contacts and leads.
            </p>
            <div className={styles.modalFields}>
              <Input
                label="Pipeline name"
                placeholder="e.g. Enterprise sales"
                value={dealModal.name}
                onChange={(e) => setDealModal((p) => ({ ...p, name: e.target.value }))}
                required
              />
              <div className={styles.fieldBlock}>
                <label className={styles.textareaLabel} htmlFor="deal-pipeline-desc">
                  Description
                </label>
                <textarea
                  id="deal-pipeline-desc"
                  className={styles.pipelineTextarea}
                  rows={4}
                  value={dealModal.description || ''}
                  onChange={(e) => setDealModal((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Optional — who this pipeline is for, or how it differs from others."
                />
              </div>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={!!dealModal.is_active}
                  onChange={(e) => setDealModal((p) => ({ ...p, is_active: e.target.checked }))}
                />
                <span>
                  <strong>Active</strong>
                  <span className={styles.checkboxSub}>Inactive pipelines stay hidden when adding deals on records.</span>
                </span>
              </label>
            </div>
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
        <Modal
          isOpen
          size="lg"
          title={stageModal.mode === 'create' ? 'New stage' : 'Edit stage'}
          onClose={() => !saving && setStageModal(null)}
        >
          <form onSubmit={saveStage} className={styles.modalForm}>
            <p className={styles.modalHint}>
              Choose 10–90% for open pipeline stages. At 100% you can keep the stage open or mark it closed as Won or Lost.
            </p>
            <div className={styles.modalFields}>
              <Input
                label="Stage name"
                placeholder="e.g. Qualification"
                value={stageModal.name}
                onChange={(e) => setStageModal((p) => ({ ...p, name: e.target.value }))}
                required
              />
              <Select
                label="Forecast & outcome"
                options={STAGE_PROGRESS_OUTCOME_OPTIONS}
                value={stageModal.progressOutcome}
                onChange={(e) => setStageModal((p) => ({ ...p, progressOutcome: e.target.value }))}
                placeholder="Select…"
              />
            </div>
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

      {boardAddModal && (
        <Modal isOpen size="lg" title="New deal" onClose={() => !saving && setBoardAddModal(null)}>
          <form onSubmit={saveBoardDeal} className={styles.modalForm}>
            <div className={styles.modalFields}>
              <div className={styles.stageFormGrid}>
                <Input label="Pipeline" value={selectedBoardDeal?.name || '—'} disabled />
                <Select
                  label="Stage"
                  value={boardAddModal.stageId}
                  onChange={(e) => setBoardAddModal((p) => ({ ...p, stageId: e.target.value }))}
                  options={
                    selectedBoardDeal?.stages?.map((s) => ({
                      value: String(s.id),
                      label: `${s.name} (${s.progression_percent}%)`,
                    })) || []
                  }
                  required
                />
                <Select
                  label="Contact type"
                  value={boardAddModal.contactType}
                  onChange={(e) =>
                    setBoardAddModal((p) => ({ ...p, contactType: e.target.value, contactId: '' }))
                  }
                  options={[
                    { value: 'lead', label: 'Lead' },
                    { value: 'contact', label: 'Contact' },
                  ]}
                />
                <Input
                  label="Search contact"
                  placeholder="Name, email, or phone"
                  value={boardAddModal.contactSearch}
                  onChange={(e) => setBoardAddModal((p) => ({ ...p, contactSearch: e.target.value }))}
                />
                <Select
                  label="Select contact"
                  value={boardAddModal.contactId}
                  onChange={(e) => setBoardAddModal((p) => ({ ...p, contactId: e.target.value }))}
                  options={contactOptions}
                  placeholder={contactSearchLoading ? 'Loading...' : 'Choose contact'}
                  required
                />
                <Select
                  label="Deal owner"
                  value={boardAddModal.ownerId}
                  onChange={(e) => setBoardAddModal((p) => ({ ...p, ownerId: e.target.value }))}
                  options={ownerChoices}
                  placeholder="Select owner"
                  required
                />
                <Input
                  label="Deal name (optional)"
                  value={boardAddModal.title}
                  onChange={(e) => setBoardAddModal((p) => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Acme - Enterprise plan"
                />
                <Input
                  label="Amount (optional)"
                  type="number"
                  min={0}
                  step={0.01}
                  value={boardAddModal.amount}
                  onChange={(e) => setBoardAddModal((p) => ({ ...p, amount: e.target.value }))}
                />
              </div>
            </div>
            <ModalFooter>
              <Button type="button" variant="ghost" onClick={() => setBoardAddModal(null)} disabled={saving}>
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
