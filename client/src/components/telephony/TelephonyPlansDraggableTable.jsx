import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '../ui/Badge';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import { IconButton } from '../ui/IconButton';
import { EditIcon, PauseIcon, PlayIcon, TrashIcon } from '../ui/ActionIcons';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeaderCell,
} from '../ui/Table';
import { formatPaiseAsInr } from '../../utils/telephonyPlanFormUtils';
import { resolvePlanCyclePrice, PLAN_BILLING_CYCLES } from '../../utils/planCyclePricing';
import { PLAN_CATEGORY } from '../../constants/telephonyProductTypes';
import styles from './TelephonyPlansDraggableTable.module.scss';

const ROLE_LABEL = { admin: 'Admin', manager: 'Manager', agent: 'Agent' };

function subscriptionPriceSummary(row) {
  if (row.is_free_trial === 1) {
    return `Free · ${row.trial_duration_days || '—'} days`;
  }
  if (row.is_contact_sales === 1) return 'Contact sales';
  const parts = [];
  for (const { value, label } of PLAN_BILLING_CYCLES) {
    const p = resolvePlanCyclePrice(row, value);
    if (p?.sale_price_paise != null && Number(p.sale_price_paise) > 0) {
      parts.push(`${label[0]}: ${formatPaiseAsInr(p.sale_price_paise)}`);
    }
  }
  return parts.length ? parts.join(' · ') : '—';
}

function PlanTypeBadge({ type }) {
  return (
    <Badge variant={type === 'unlimited' ? 'success' : 'warning'}>
      {type === 'unlimited' ? 'Unlimited' : 'Credit'}
    </Badge>
  );
}

export function TelephonyPlansDraggableTable({
  plans,
  category,
  selectedId,
  onSelect,
  onEdit,
  onToggle,
  onDelete,
  canReorder = false,
  reorderBusy = false,
  onReorder,
}) {
  const isTopUp = category === PLAN_CATEGORY.CREDIT_TOP_UP;
  const isSeat = category === PLAN_CATEGORY.SEAT_ADD_ON;
  const isSubscription = category === PLAN_CATEGORY.SUBSCRIPTION;
  const [orderedPlans, setOrderedPlans] = useState(plans);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    setOrderedPlans(plans);
  }, [plans]);

  const handleDragStart = useCallback((e, id) => {
    if (!canReorder || reorderBusy) {
      e.preventDefault();
      return;
    }
    isDraggingRef.current = true;
    e.stopPropagation();
    const idStr = String(id);
    e.dataTransfer.setData('text/plain', idStr);
    e.dataTransfer.setData('application/x-telephony-plan-id', idStr);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(id);
  }, [canReorder, reorderBusy]);

  const handleDragEnd = useCallback(() => {
    isDraggingRef.current = false;
    setDraggingId(null);
    setDragOverId(null);
  }, []);

  const handleDragOver = useCallback(
    (e, id) => {
      if (!canReorder || reorderBusy) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      setDragOverId(id);
    },
    [canReorder, reorderBusy]
  );

  const handleDragLeave = useCallback((e) => {
    const related = e.relatedTarget;
    if (related && e.currentTarget.contains(related)) return;
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback(
    async (e, targetId) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverId(null);
      setDraggingId(null);
      isDraggingRef.current = false;

      if (!canReorder || reorderBusy || !onReorder) return;

      const draggedId =
        e.dataTransfer.getData('application/x-telephony-plan-id') ||
        e.dataTransfer.getData('text/plain');
      if (!draggedId || String(draggedId) === String(targetId)) return;

      const from = orderedPlans.findIndex((p) => String(p.id) === String(draggedId));
      const to = orderedPlans.findIndex((p) => String(p.id) === String(targetId));
      if (from < 0 || to < 0) return;

      const next = [...orderedPlans];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);

      const previous = orderedPlans;
      setOrderedPlans(next);
      try {
        await onReorder(next);
      } catch {
        setOrderedPlans(previous);
      }
    },
    [canReorder, reorderBusy, onReorder, orderedPlans]
  );

  const handleRowClick = useCallback(
    (row) => {
      if (isDraggingRef.current) return;
      onSelect(row);
    },
    [onSelect]
  );

  return (
    <Table>
      <TableHead>
        <TableRow>
          {canReorder ? (
            <TableHeaderCell width="48px" aria-label="Reorder">
              <MaterialSymbol name="drag_indicator" size="sm" className={styles.headIcon} />
            </TableHeaderCell>
          ) : null}
          <TableHeaderCell>Plan</TableHeaderCell>
          {isSubscription ? <TableHeaderCell>Mode</TableHeaderCell> : null}
          {isSeat ? <TableHeaderCell>Role</TableHeaderCell> : null}
          {isSeat ? <TableHeaderCell>Channel</TableHeaderCell> : null}
          <TableHeaderCell>
            {isTopUp ? 'Price' : isSeat ? 'Price / seat' : 'Cycle prices'}
          </TableHeaderCell>
          {isSubscription ? <TableHeaderCell>Seats (bundle)</TableHeaderCell> : null}
          {isSubscription ? <TableHeaderCell>Visibility</TableHeaderCell> : null}
          {isTopUp ? <TableHeaderCell>Wallet credit</TableHeaderCell> : null}
          <TableHeaderCell>Status</TableHeaderCell>
          <TableHeaderCell aria-label="Actions" />
        </TableRow>
      </TableHead>
      <TableBody>
        {orderedPlans.map((row) => {
          const isSelected = Number(selectedId) === Number(row.id);
          const isDragging = draggingId != null && String(draggingId) === String(row.id);
          const isDragOver = dragOverId != null && String(dragOverId) === String(row.id);

          return (
            <TableRow
              key={row.id}
              className={[
                isSelected ? styles.rowSelected : styles.rowClickable,
                isDragging ? styles.rowDragging : '',
                isDragOver ? styles.rowDragOver : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => handleRowClick(row)}
              onDragOver={canReorder ? (e) => handleDragOver(e, row.id) : undefined}
              onDragLeave={canReorder ? handleDragLeave : undefined}
              onDrop={canReorder ? (e) => handleDrop(e, row.id) : undefined}
            >
              {canReorder ? (
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div
                    role="button"
                    tabIndex={0}
                    className={styles.dragHandle}
                    draggable={!reorderBusy}
                    title="Drag to reorder"
                    aria-label={`Drag to reorder ${row.name}`}
                    onDragStart={(e) => handleDragStart(e, row.id)}
                    onDragEnd={handleDragEnd}
                  >
                    <MaterialSymbol name="drag_indicator" size="sm" />
                  </div>
                </TableCell>
              ) : null}
              <TableCell>
                <div className={styles.cellStack}>
                  <strong>{row.name}</strong>
                  <span className={styles.muted}>{row.code}</span>
                </div>
              </TableCell>
              {isSubscription ? (
                <TableCell>
                  <PlanTypeBadge type={row.plan_type} />
                </TableCell>
              ) : null}
              {isSeat ? (
                <TableCell>{ROLE_LABEL[row.seat_role] || row.seat_role || '—'}</TableCell>
              ) : null}
              {isSeat ? (
                <TableCell>{row.includes_unlimited_channels === 1 ? 'Yes' : 'No'}</TableCell>
              ) : null}
              <TableCell className={styles.muted}>
                {isTopUp || isSeat ? (
                  <>
                    {formatPaiseAsInr(row.sale_price_paise)}
                    {isTopUp ? ' · one-time' : ''}
                    {row.discount_percent ? ` · ${row.discount_percent}% off` : ''}
                  </>
                ) : (
                  subscriptionPriceSummary(row)
                )}
              </TableCell>
              {isSubscription ? (
                <TableCell className={styles.muted}>
                  {[
                    row.seat_limit_admins != null ? `Adm:${row.seat_limit_admins}` : null,
                    row.seat_limit_managers != null ? `Mgr:${row.seat_limit_managers}` : null,
                    (row.seat_limit_agents ?? row.seat_limit_users) != null
                      ? `Ag:${row.seat_limit_agents ?? row.seat_limit_users}`
                      : null,
                    row.seat_limit_channels != null ? `Ch:${row.seat_limit_channels}` : null,
                  ]
                    .filter(Boolean)
                    .join(' ') || '—'}
                </TableCell>
              ) : null}
              {isSubscription ? (
                <TableCell className={styles.muted}>
                  {[
                    row.visible_on_website !== 0 ? 'Web' : null,
                    row.visible_on_panel !== 0 ? 'Panel' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Hidden'}
                </TableCell>
              ) : null}
              {isTopUp ? (
                <TableCell>{formatPaiseAsInr(row.wallet_credit_paise)}</TableCell>
              ) : null}
              <TableCell>
                <Badge variant={row.is_active === 1 ? 'success' : 'muted'}>
                  {row.is_active === 1 ? 'Active' : 'Inactive'}
                </Badge>
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <div className={styles.rowActions}>
                  <IconButton title="Edit" onClick={() => onEdit(row)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    title={row.is_active === 1 ? 'Deactivate' : 'Activate'}
                    variant={row.is_active === 1 ? 'warning' : 'success'}
                    onClick={() => onToggle(row)}
                  >
                    {row.is_active === 1 ? <PauseIcon /> : <PlayIcon />}
                  </IconButton>
                  <IconButton title="Delete" variant="danger" onClick={() => onDelete(row)}>
                    <TrashIcon />
                  </IconButton>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
