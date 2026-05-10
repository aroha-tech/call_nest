import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppSelector } from '../app/hooks';
import { selectUser } from '../features/auth/authSelectors';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { RowActionGroup } from '../components/ui/ActionIcons';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Checkbox } from '../components/ui/Checkbox';
import { Alert } from '../components/ui/Alert';
import { Skeleton } from '../components/ui/Skeleton';
import { Modal, ModalFooter, ConfirmModal } from '../components/ui/Modal';
import { SlidePanel } from '../components/ui/SlidePanel';
import { InfoHelpIcon } from '../components/ui/InfoHelpIcon';
import { MaterialSymbol } from '../components/ui/MaterialSymbol';
import { dealsAPI } from '../services/dealsAPI';
import { opportunitiesAPI } from '../services/opportunitiesAPI';
import { tenantUsersAPI } from '../services/tenantUsersAPI';
import { useDateTimeDisplay } from '../hooks/useDateTimeDisplay';
import { useToast } from '../context/ToastContext';
import { DealPipelineWizard } from '../features/deals/DealPipelineWizard';
import { NewDealWizard } from '../features/deals/NewDealWizard';
import { DEAL_CURRENCY_OPTIONS, DEFAULT_DEAL_CURRENCY } from '../features/deals/dealUiConstants';
import {
  STAGE_PROGRESS_OUTCOME_OPTIONS,
  progressOutcomeFromStage,
  parseProgressOutcome,
} from '../features/deals/dealStageOutcome';
import styles from './DealsPage.module.scss';

function oppPriorityPill(priority) {
  const p = String(priority || 'medium').toLowerCase();
  if (p === 'high') return { label: 'High', cls: 'oppPriHigh' };
  if (p === 'low') return { label: 'Low', cls: 'oppPriLow' };
  return { label: 'Medium', cls: 'oppPriMed' };
}

function formatDealMoney(amount, currencyCode) {
  const code = (currencyCode || DEFAULT_DEAL_CURRENCY).toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(Number(amount) || 0);
  } catch {
    return `${code} ${Number(amount).toLocaleString()}`;
  }
}

function effectiveOppCurrency(o, pipelineCurrency) {
  const pc = (pipelineCurrency || DEFAULT_DEAL_CURRENCY).toUpperCase();
  const raw = o?.amount_currency;
  if (raw != null && String(raw).trim() !== '') return String(raw).trim().toUpperCase();
  return pc;
}

/** Sum deal amounts per currency for a column (matches backend board totals; no FX conversion). */
function computeStageTotalsFromOpportunities(opps, pipelineCurrency) {
  const map = new Map();
  for (const o of opps || []) {
    if (o.amount == null) continue;
    const cur = effectiveOppCurrency(o, pipelineCurrency);
    map.set(cur, (map.get(cur) || 0) + (Number(o.amount) || 0));
  }
  return [...map.entries()]
    .map(([currency_code, total_amount]) => ({ currency_code, total_amount }))
    .sort((a, b) => a.currency_code.localeCompare(b.currency_code));
}

function withRecomputedStageTotals(prev) {
  if (!prev?.columns?.length) return prev;
  const pipelineCur = prev?.deal?.currency_code || DEFAULT_DEAL_CURRENCY;
  return {
    ...prev,
    columns: prev.columns.map((col) => ({
      ...col,
      stage_amount_totals: computeStageTotalsFromOpportunities(col.opportunities, pipelineCur),
    })),
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
  const nextCols = without.map((col) => {
    if (String(col.id) !== toId) return col;
    return {
      ...col,
      opportunities: [moved, ...(col.opportunities || [])],
    };
  });
  return withRecomputedStageTotals({ ...prev, columns: nextCols });
}

/** Remove one opportunity from the board payload (e.g. after delete). */
function removeOppFromBoard(prev, oppId, stageId) {
  if (!prev?.columns?.length) return prev;
  const sid = String(stageId);
  const nextCols = prev.columns.map((col) => {
    if (String(col.id) !== sid) return col;
    const opps = col.opportunities || [];
    const i = opps.findIndex((o) => Number(o.id) === Number(oppId));
    if (i === -1) return col;
    return {
      ...col,
      opportunities: [...opps.slice(0, i), ...opps.slice(i + 1)],
    };
  });
  return withRecomputedStageTotals({ ...prev, columns: nextCols });
}

export function DealsPage() {
  const user = useAppSelector(selectUser);
  const { formatDate } = useDateTimeDisplay();
  const { showToast } = useToast();
  const [tab, setTab] = useState('board');
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [boardDealId, setBoardDealId] = useState('');
  const [boardData, setBoardData] = useState(null);
  const [boardLoading, setBoardLoading] = useState(false);

  const [dealModal, setDealModal] = useState(null);
  const [stageModal, setStageModal] = useState(null);
  const [pipelineWizardOpen, setPipelineWizardOpen] = useState(false);
  const [newDealOpen, setNewDealOpen] = useState(false);
  const [deleteDeal, setDeleteDeal] = useState(null);
  const [deleteStage, setDeleteStage] = useState(null);
  const [deleteOpp, setDeleteOpp] = useState(null);
  const [saving, setSaving] = useState(false);
  const [draggingStageId, setDraggingStageId] = useState(null);
  const [draggingOppId, setDraggingOppId] = useState(null);
  const [dragOverStageId, setDragOverStageId] = useState(null);
  const [ownerOptions, setOwnerOptions] = useState([]);
  const [expandedPipelineIds, setExpandedPipelineIds] = useState(() => new Set());
  const boardScrollRef = useRef(null);

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
    if (!dealModal || dealModal.mode !== 'edit') return;
    const { name, description, is_active } = dealModal;
    if (!String(name || '').trim()) {
      showToast('Name is required', 'warning');
      return;
    }
    setSaving(true);
    try {
      await dealsAPI.update(dealModal.id, {
        name: name.trim(),
        description: description?.trim() || null,
        is_active: !!is_active,
        owner_user_id: dealModal.owner_user_id ? Number(dealModal.owner_user_id) : null,
        currency_code: dealModal.currency_code || DEFAULT_DEAL_CURRENCY,
        probability_mode: dealModal.probability_mode || 'stage',
        visibility: dealModal.visibility || 'private',
        goal_amount: dealModal.goal_amount === '' || dealModal.goal_amount == null ? null : Number(dealModal.goal_amount),
        goal_deals: dealModal.goal_deals === '' || dealModal.goal_deals == null ? null : Number(dealModal.goal_deals),
      });
      showToast('Pipeline updated', 'success');
      setDealModal(null);
      await fetchDeals();
      if (tab === 'board') await fetchBoard();
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
        color_hex: stageModal.color_hex || null,
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

  async function confirmDeleteOpp() {
    if (!deleteOpp) return;
    setSaving(true);
    const snapshot = boardData;
    setBoardData((prev) => removeOppFromBoard(prev, deleteOpp.id, deleteOpp.stageId));
    try {
      await opportunitiesAPI.remove(deleteOpp.id);
      showToast('Deal removed', 'success');
      setDeleteOpp(null);
    } catch (err) {
      setBoardData(snapshot);
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

  /** While dragging a deal, auto-scroll the board horizontally near the viewport edges. */
  useEffect(() => {
    if (!draggingOppId) return undefined;
    const EDGE = 72;
    const STEP = 32;
    const onDragOver = (e) => {
      const el = boardScrollRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = e.clientX;
      if (x < r.left + EDGE) {
        el.scrollLeft = Math.max(0, el.scrollLeft - STEP);
      } else if (x > r.right - EDGE) {
        el.scrollLeft = Math.min(el.scrollWidth - el.clientWidth, el.scrollLeft + STEP);
      }
    };
    document.addEventListener('dragover', onDragOver);
    return () => document.removeEventListener('dragover', onDragOver);
  }, [draggingOppId]);

  const togglePipelineExpanded = useCallback((dealId) => {
    setExpandedPipelineIds((prev) => {
      const next = new Set(prev);
      const id = String(dealId);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

  const pipelineSelectOptions = useMemo(
    () => deals.filter((d) => d.is_active).map((d) => ({ value: String(d.id), label: d.name || '—' })),
    [deals]
  );

  if (loading && !deals.length) {
    return (
      <div className={`${styles.page} ${styles.pageBoardFull}`.trim()}>
        <PageHeader title="Deals" description="Pipelines and board by stage." />
        <div className={styles.tabsWrap} aria-hidden>
          <div className={styles.tabs}>
            <Skeleton width={168} height={36} style={{ borderRadius: 9 }} />
            <Skeleton width={112} height={36} style={{ borderRadius: 9 }} />
          </div>
        </div>
        <div className={styles.boardSkelRoot} aria-busy="true" aria-label="Loading deals">
          <div className={styles.boardToolbar}>
            <div className={styles.boardToolbarFields}>
              <Skeleton height={48} width="100%" style={{ maxWidth: 360 }} />
            </div>
            <div className={styles.boardToolbarActions}>
              <Skeleton width={96} height={32} style={{ borderRadius: 8 }} />
              <Skeleton width={88} height={32} style={{ borderRadius: 8 }} />
            </div>
          </div>
          <div className={styles.boardScroll}>
            {Array.from({ length: 6 }, (_, col) => (
              <div key={`deals-initial-skel-${col}`} className={styles.boardCol}>
                <div className={styles.boardColHead}>
                  <div className={styles.boardColTitleRow}>
                    <Skeleton width="78%" height={18} />
                    <Skeleton width={40} height={18} style={{ borderRadius: 6 }} />
                  </div>
                  <div className={styles.boardColMeta}>
                    <Skeleton width={52} height={22} style={{ borderRadius: 999 }} />
                    <Skeleton width={72} height={14} />
                  </div>
                </div>
                <div className={styles.boardColTotalBar}>
                  <Skeleton width="88%" height={16} style={{ borderRadius: 4 }} />
                </div>
                <div className={styles.boardColBody}>
                  <div className={styles.boardColEmptySkel}>
                    <Skeleton height={56} width="100%" style={{ borderRadius: 12, marginBottom: 10 }} />
                    <Skeleton height={56} width="100%" style={{ borderRadius: 12 }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.page} ${tab === 'board' || tab === 'setup' ? styles.pageBoardFull : ''}`.trim()}>
      <PageHeader
        title="Deals"
        description="Kanban by stage, pipeline settings, and quick deal creation."
        breadcrumbs={
          <>
            <Link className={styles.breadcrumbLink} to="/">
              Home
            </Link>
            <span className={styles.breadcrumbSep} aria-hidden>
              /
            </span>
            <span>Deals</span>
          </>
        }
        actions={
          <Button type="button" variant="primary" size="sm" onClick={() => setPipelineWizardOpen(true)}>
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
            aria-selected={tab === 'board'}
            className={`${styles.tab} ${tab === 'board' ? styles.tabActive : ''}`}
            onClick={() => setTab('board')}
          >
            Board
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'setup'}
            className={`${styles.tab} ${tab === 'setup' ? styles.tabActive : ''}`}
            onClick={() => setTab('setup')}
          >
            Pipelines &amp; stages
          </button>
        </div>
      </div>

      {tab === 'setup' && (
        <>
          {!deals.length ? (
            <InfoHelpIcon
              title="Pipelines info"
              modalTitle="Pipelines and stages"
              message="No pipelines yet. Create one and add stages."
            />
          ) : (
            <div className={styles.pipelineMasterCard}>
              <p className={styles.pipelineMasterHint}>
                Expand a pipeline to view and reorder its stages. Use the toolbar to edit the pipeline, add a stage, or
                delete.
              </p>
              <div className={styles.stageTableWrap}>
                <table className={styles.pipelineMasterTable}>
                  <thead>
                    <tr>
                      <th className={styles.pipelineExpandCol} aria-label="Expand stages" />
                      <th>Pipeline</th>
                      <th className={styles.pipelineNumCol}>Stages</th>
                      <th className={styles.pipelineStatusCol}>Status</th>
                      <th className={styles.pipelineCurrencyCol}>Currency</th>
                      <th className={styles.pipelineActionsCol}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deals.map((d) => {
                      const isOpen = expandedPipelineIds.has(String(d.id));
                      const stageCount = d.stages?.length ?? 0;
                      return (
                        <React.Fragment key={d.id}>
                          <tr className={isOpen ? styles.pipelineMasterRowOpen : ''}>
                            <td className={styles.pipelineExpandCol}>
                              <button
                                type="button"
                                className={styles.pipelineExpandBtn}
                                aria-expanded={isOpen}
                                aria-controls={`pipeline-stages-${d.id}`}
                                title={isOpen ? 'Hide stages' : 'View stages'}
                                onClick={() => togglePipelineExpanded(d.id)}
                              >
                                <MaterialSymbol
                                  name={isOpen ? 'expand_more' : 'chevron_right'}
                                  size="sm"
                                  className={styles.pipelineExpandIcon}
                                />
                              </button>
                            </td>
                            <td>
                              <div className={styles.pipelineNameCell}>
                                <span className={styles.pipelineNameText}>{d.name}</span>
                                {!d.is_active ? <span className={styles.pipelineInactiveBadge}>Inactive</span> : null}
                              </div>
                              {d.description ? <div className={styles.pipelineDescSnippet}>{d.description}</div> : null}
                            </td>
                            <td className={styles.pipelineNumCol}>{stageCount}</td>
                            <td className={styles.pipelineStatusCol}>
                              {d.is_active ? (
                                <span className={styles.pipelineStatusOn}>Active</span>
                              ) : (
                                <span className={styles.pipelineStatusOff}>Off</span>
                              )}
                            </td>
                            <td className={styles.pipelineCurrencyCol}>{d.currency_code || DEFAULT_DEAL_CURRENCY}</td>
                            <td className={styles.pipelineActionsCol}>
                              <div className={styles.pipelineToolbar}>
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
                                      owner_user_id: d.owner_user_id != null ? String(d.owner_user_id) : '',
                                      currency_code: d.currency_code || DEFAULT_DEAL_CURRENCY,
                                      probability_mode: d.probability_mode || 'stage',
                                      visibility: d.visibility || 'private',
                                      goal_amount: d.goal_amount != null ? String(d.goal_amount) : '',
                                      goal_deals: d.goal_deals != null ? String(d.goal_deals) : '',
                                    })
                                  }
                                >
                                  <MaterialSymbol name="edit" size="sm" className={styles.msIconViolet} aria-hidden />
                                </IconButton>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  className={styles.pipelineAddStageBtn}
                                  onClick={() =>
                                    setStageModal({
                                      mode: 'create',
                                      dealId: d.id,
                                      name: '',
                                      progressOutcome: '10|open',
                                      color_hex: '#64748B',
                                    })
                                  }
                                >
                                  <MaterialSymbol name="add_circle" size="sm" className={styles.msIconGreen} />
                                  Stage
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className={styles.pipelineDeleteBtn}
                                  onClick={() => setDeleteDeal({ id: d.id, name: d.name })}
                                >
                                  <MaterialSymbol name="delete" size="sm" className={styles.msIconRed} />
                                  Delete
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {isOpen ? (
                            <tr className={styles.pipelineStagesWrapRow}>
                              <td colSpan={6} className={styles.pipelineStagesCell} id={`pipeline-stages-${d.id}`}>
                                {stageCount ? (
                                  <div className={styles.pipelineNestedTableWrap}>
                                    <table className={styles.stageTable}>
                                      <thead>
                                        <tr>
                                          <th className={styles.stageOrderCol}>Reorder</th>
                                          <th>Stage</th>
                                          <th className={styles.stageColorCol}>Color</th>
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
                                                <MaterialSymbol name="drag_indicator" size="sm" className={styles.msIconMuted} />
                                              </div>
                                            </td>
                                            <td className={styles.stageNameCell}>{s.name}</td>
                                            <td className={styles.stageColorCol}>
                                              {s.color_hex ? (
                                                <span
                                                  className={styles.stageTableSwatch}
                                                  style={{ background: s.color_hex }}
                                                  title={s.color_hex}
                                                />
                                              ) : (
                                                <span className={styles.stageTableSwatchUnset} title="No color set" />
                                              )}
                                            </td>
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
                                                      color_hex: s.color_hex || '#64748B',
                                                    })
                                                  }
                                                >
                                                  <MaterialSymbol name="edit" size="sm" className={styles.msIconViolet} />
                                                </IconButton>
                                                <IconButton
                                                  size="sm"
                                                  variant="danger"
                                                  title="Remove stage"
                                                  onClick={() => setDeleteStage({ dealId: d.id, stageId: s.id, name: s.name })}
                                                >
                                                  <MaterialSymbol name="delete" size="sm" className={styles.msIconRed} />
                                                </IconButton>
                                              </RowActionGroup>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <div className={styles.pipelineStagesEmpty}>
                                    <MaterialSymbol name="layers" size="md" className={styles.msIconMuted} />
                                    <span>No stages yet. Add one with <strong>Stage</strong> above.</span>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
              <Button type="button" variant="primary" size="sm" disabled={!selectedBoardDeal} onClick={() => setNewDealOpen(true)}>
                New deal
              </Button>
              <Button type="button" variant="secondary" size="sm" disabled={!boardDealId || boardLoading} onClick={fetchBoard}>
                Refresh
              </Button>
            </div>
          </div>
          {!boardLoading && boardData && (boardData.columns?.length || 0) > 3 ? (
            <p className={styles.boardEdgeScrollHint}>
              <MaterialSymbol name="swap_horiz" size="sm" className={styles.boardEdgeScrollIcon} aria-hidden />
              While dragging a deal, move the cursor near the left or right edge of the board to scroll horizontally.
            </p>
          ) : null}
          {boardLoading ? (
            <div className={styles.boardSkelRoot} aria-busy="true" aria-label="Loading board">
              <div className={styles.boardToolbar}>
                <div className={styles.boardToolbarFields}>
                  <Skeleton height={48} width="100%" style={{ maxWidth: 360 }} />
                </div>
                <div className={styles.boardToolbarActions}>
                  <Skeleton width={96} height={32} style={{ borderRadius: 8 }} />
                  <Skeleton width={88} height={32} style={{ borderRadius: 8 }} />
                </div>
              </div>
              <div className={styles.boardScroll}>
                {Array.from({ length: 6 }, (_, col) => (
                  <div key={`board-skel-col-${col}`} className={styles.boardCol}>
                    <div className={styles.boardColHead}>
                      <div className={styles.boardColTitleRow}>
                        <Skeleton width="72%" height={18} />
                        <Skeleton width={44} height={20} style={{ borderRadius: 6 }} />
                      </div>
                      <div className={styles.boardColMeta}>
                        <Skeleton width={52} height={22} style={{ borderRadius: 999 }} />
                        <Skeleton width={68} height={14} />
                      </div>
                    </div>
                    <div className={styles.boardColTotalBar}>
                      <Skeleton width="85%" height={16} style={{ borderRadius: 4 }} />
                    </div>
                    <div className={styles.boardColBody}>
                      <Skeleton height={88} width="100%" style={{ borderRadius: 12, marginBottom: 10 }} />
                      <Skeleton height={72} width="100%" style={{ borderRadius: 12 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {!boardLoading && boardData && (
            <div className={styles.boardRoot}>
              <div ref={boardScrollRef} className={styles.boardScroll}>
                {boardData.columns.map((col) => {
                  const boardCurrency = boardData.deal?.currency_code || DEFAULT_DEAL_CURRENCY;
                  const opps = col.opportunities || [];
                  const totalLines =
                    Array.isArray(col.stage_amount_totals) && col.stage_amount_totals.length > 0
                      ? col.stage_amount_totals
                      : computeStageTotalsFromOpportunities(opps, boardCurrency);
                  return (
                    <div key={col.id} className={styles.boardCol}>
                      <div className={styles.boardColHead}>
                        <div className={styles.boardColTitleRow}>
                          {col.color_hex ? (
                            <span
                              className={styles.boardStageDot}
                              style={{ background: col.color_hex }}
                              aria-hidden
                            />
                          ) : null}
                          <div className={styles.boardColTitle}>{col.name}</div>
                          {Number(col.is_closed_won) === 1 || col.is_closed_won === true ? (
                            <span className={`${styles.boardColOutcome} ${styles.boardColOutcomeWon}`}>Won</span>
                          ) : Number(col.is_closed_lost) === 1 || col.is_closed_lost === true ? (
                            <span className={`${styles.boardColOutcome} ${styles.boardColOutcomeLost}`}>Lost</span>
                          ) : null}
                        </div>
                        <div className={styles.boardColMeta}>
                          <span className={styles.boardColBadge}>{Math.round(Number(col.progression_percent) || 0)}%</span>
                          <span className={styles.boardColCount}>{opps.length} deals</span>
                        </div>
                      </div>
                      <div className={styles.boardColTotalBar}>
                        {totalLines.length === 0 ? (
                          <>Total: {formatDealMoney(0, boardCurrency)}</>
                        ) : totalLines.length === 1 ? (
                          <>Total: {formatDealMoney(totalLines[0].total_amount, totalLines[0].currency_code)}</>
                        ) : (
                          <p className={styles.boardColTotalUnavailable}>
                            Total not shown — this stage has deals in more than one currency. See each card for its
                            amount.
                          </p>
                        )}
                      </div>
                      <div
                        className={`${styles.boardColBody} ${String(dragOverStageId) === String(col.id) ? styles.boardColBodyDropActive : ''}`}
                        onDragOver={(e) => handleOppStageDragOver(e, col.id)}
                        onDragLeave={() => setDragOverStageId((prev) => (String(prev) === String(col.id) ? null : prev))}
                        onDrop={(e) => handleOppDrop(e, col.id)}
                      >
                        {opps.length === 0 ? (
                          <div className={styles.boardColEmpty}>No deals in this stage</div>
                        ) : null}
                        {opps.map((o) => (
                          <div key={o.id} className={styles.oppCardWrap}>
                            <Link
                              to={o.contact_type === 'lead' ? `/leads/${o.contact_id}` : `/contacts/${o.contact_id}`}
                              className={`${styles.oppCard} ${String(draggingOppId) === String(o.id) ? styles.oppCardDragging : ''}`}
                              draggable={!saving}
                              onDragStart={(e) => handleOppDragStart(e, o.id, col.id)}
                              onDragEnd={handleOppDragEnd}
                            >
                              <div className={styles.oppCardTop}>
                                <div className={styles.oppDealTitle}>
                                  {String(o.title || '').trim() || 'Untitled deal'}
                                </div>
                                <span
                                  className={`${styles.oppPriority} ${styles[oppPriorityPill(o.priority).cls]}`}
                                  title="Priority"
                                >
                                  {oppPriorityPill(o.priority).label}
                                </span>
                              </div>
                              <div className={styles.oppContactRow}>
                                <span className={styles.oppContactLabel}>Contact</span>
                                <span className={styles.oppContactName}>{o.display_name || o.email || '—'}</span>
                              </div>
                              {o.account_name ? (
                                <div className={styles.oppMeta}>
                                  <span className={styles.oppMetaKey}>Account</span> {o.account_name}
                                </div>
                              ) : null}
                              {o.amount != null ? (
                                <div className={styles.oppMetaStrong}>
                                  {formatDealMoney(o.amount, o.amount_currency || boardCurrency)}
                                </div>
                              ) : null}
                              {o.value_type ? (
                                <div className={styles.oppMeta}>
                                  <span className={styles.oppMetaKey}>Value</span> {o.value_type}
                                </div>
                              ) : null}
                              {o.expected_revenue != null ? (
                                <div className={styles.oppMeta}>
                                  <span className={styles.oppMetaKey}>Exp. revenue</span>{' '}
                                  {formatDealMoney(o.expected_revenue, boardCurrency)}
                                </div>
                              ) : null}
                              {o.closing_date ? (
                                <div className={styles.oppMeta}>
                                  <span className={styles.oppMetaKey}>Close</span> {formatDate(o.closing_date)}
                                </div>
                              ) : null}
                              {o.owner_name ? (
                                <div className={styles.oppMeta}>
                                  <span className={styles.oppMetaKey}>Owner</span> {o.owner_name}
                                </div>
                              ) : null}
                            </Link>
                            <IconButton
                              type="button"
                              size="sm"
                              variant="danger"
                              className={styles.oppCardDelete}
                              title="Remove deal"
                              aria-label="Remove deal"
                              disabled={saving}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setDeleteOpp({ id: o.id, stageId: col.id, label: o.title || o.display_name || `#${o.id}` });
                              }}
                            >
                              <MaterialSymbol name="delete" size="sm" className={styles.msIconRed} />
                            </IconButton>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {dealModal?.mode === 'edit' && (
        <SlidePanel
          isOpen
          size="wide"
          title="Edit pipeline"
          titleHint="Update pipeline settings. Reorder or edit stages in the list below."
          onClose={() => !saving && setDealModal(null)}
          closeOnOverlay={!saving}
          closeOnEscape={!saving}
        >
          <form onSubmit={saveDeal} className={styles.modalForm}>
            <div className={styles.modalFields}>
              <div className={styles.stageFormGrid}>
                <Input
                  label="Pipeline name"
                  placeholder="e.g. Enterprise sales"
                  value={dealModal.name}
                  onChange={(e) => setDealModal((p) => ({ ...p, name: e.target.value }))}
                  required
                />
                <Select
                  label="Pipeline owner"
                  value={dealModal.owner_user_id || ''}
                  onChange={(e) => setDealModal((p) => ({ ...p, owner_user_id: e.target.value }))}
                  options={ownerChoices}
                  placeholder="Select owner"
                />
                <Select
                  label="Currency"
                  value={dealModal.currency_code || DEFAULT_DEAL_CURRENCY}
                  onChange={(e) => setDealModal((p) => ({ ...p, currency_code: e.target.value }))}
                  options={DEAL_CURRENCY_OPTIONS}
                />
                <Select
                  label="Probability mode"
                  value={dealModal.probability_mode || 'stage'}
                  onChange={(e) => setDealModal((p) => ({ ...p, probability_mode: e.target.value }))}
                  options={[
                    { value: 'stage', label: 'Standard (per stage)' },
                    { value: 'custom', label: 'Custom (per deal)' },
                  ]}
                />
                <Input
                  label="Goal amount (optional)"
                  type="number"
                  min={0}
                  step={0.01}
                  value={dealModal.goal_amount}
                  onChange={(e) => setDealModal((p) => ({ ...p, goal_amount: e.target.value }))}
                />
                <Input
                  label="Goal deals (optional)"
                  type="number"
                  min={0}
                  step={1}
                  value={dealModal.goal_deals}
                  onChange={(e) => setDealModal((p) => ({ ...p, goal_deals: e.target.value }))}
                />
                <Select
                  label="Visibility"
                  value={dealModal.visibility || 'private'}
                  onChange={(e) => setDealModal((p) => ({ ...p, visibility: e.target.value }))}
                  options={[
                    { value: 'private', label: 'Private (team)' },
                    { value: 'workspace', label: 'Workspace' },
                  ]}
                />
              </div>
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
              <Checkbox
                className={styles.pipelineActiveCheckbox}
                labelClassName={styles.pipelineActiveCheckboxLabelWrap}
                checked={!!dealModal.is_active}
                onChange={(e) => setDealModal((p) => ({ ...p, is_active: e.target.checked }))}
                label={
                  <span className={styles.pipelineActiveCheckboxLabel}>
                    <strong>Active</strong>
                    <span className={styles.checkboxSub}>
                      Inactive pipelines stay hidden when adding deals on records.
                    </span>
                  </span>
                }
              />
            </div>
            <ModalFooter>
              <Button type="button" variant="ghost" onClick={() => setDealModal(null)} disabled={saving}>
                <MaterialSymbol name="close" size="sm" style={{ marginRight: 6 }} className={styles.msIconMuted} />
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={saving}>
                <MaterialSymbol name="save" size="sm" style={{ marginRight: 6 }} />
                Save
              </Button>
            </ModalFooter>
          </form>
        </SlidePanel>
      )}

      {stageModal && (
        <Modal
          isOpen
          size="md"
          title={stageModal.mode === 'create' ? 'New stage' : 'Edit stage'}
          onClose={() => !saving && setStageModal(null)}
        >
          <form onSubmit={saveStage} className={styles.modalForm}>
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
                hint="Pick probability and outcome. Closed won/lost use 100%."
              />
              <div className={styles.fieldBlock}>
                <label className={styles.textareaLabel} htmlFor="stage-color">
                  Stage color
                </label>
                <input
                  id="stage-color"
                  type="color"
                  className={styles.stageColorInput}
                  value={stageModal.color_hex?.startsWith('#') ? stageModal.color_hex : '#64748B'}
                  onChange={(e) => setStageModal((p) => ({ ...p, color_hex: e.target.value }))}
                />
              </div>
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

      <DealPipelineWizard
        isOpen={pipelineWizardOpen}
        onClose={() => setPipelineWizardOpen(false)}
        onSaved={() => {
          fetchDeals();
          setTab('setup');
        }}
        ownerOptions={ownerChoices.map((o) => ({ value: o.value, label: o.label }))}
        defaultOwnerId={user?.id}
      />

      <NewDealWizard
        isOpen={newDealOpen}
        onClose={() => setNewDealOpen(false)}
        pipelineOptions={pipelineSelectOptions}
        deals={deals}
        ownerOptions={ownerChoices.map((o) => ({ value: o.value, label: o.label }))}
        defaultOwnerId={user?.id}
        defaultDealId={boardDealId || undefined}
        onCreated={() => fetchBoard()}
      />

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

      <ConfirmModal
        isOpen={!!deleteOpp}
        onClose={() => setDeleteOpp(null)}
        onConfirm={confirmDeleteOpp}
        title="Remove deal"
        message={`Remove deal "${deleteOpp?.label}"? This cannot be undone.`}
        confirmText="Remove"
        loading={saving}
      />
    </div>
  );
}
