import React, { useCallback, useState } from 'react';
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
import styles from './TelephonyPlansDraggableTable.module.scss';

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
  const isPurchase = category === 'credit_purchase';
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  const handleDragStart = useCallback((e, id) => {
    e.dataTransfer.setData('text/plain', String(id));
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(id);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverId(null);
  }, []);

  const handleDragOver = useCallback(
    (e, id) => {
      if (!canReorder || reorderBusy) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverId(id);
    },
    [canReorder, reorderBusy]
  );

  const handleDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback(
    async (e, targetId) => {
      e.preventDefault();
      setDragOverId(null);
      setDraggingId(null);
      if (!canReorder || reorderBusy || !onReorder) return;

      const draggedId = e.dataTransfer.getData('text/plain');
      if (!draggedId || String(draggedId) === String(targetId)) return;

      const from = plans.findIndex((p) => String(p.id) === String(draggedId));
      const to = plans.findIndex((p) => String(p.id) === String(targetId));
      if (from < 0 || to < 0) return;

      const next = [...plans];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      await onReorder(next);
    },
    [canReorder, reorderBusy, onReorder, plans]
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
          {!isPurchase ? <TableHeaderCell>Mode</TableHeaderCell> : null}
          <TableHeaderCell>{isPurchase ? 'Pricing' : 'Cycle prices'}</TableHeaderCell>
          {!isPurchase ? <TableHeaderCell>Seats</TableHeaderCell> : null}
          {isPurchase ? <TableHeaderCell>Wallet credit</TableHeaderCell> : null}
          <TableHeaderCell>Status</TableHeaderCell>
          <TableHeaderCell aria-label="Actions" />
        </TableRow>
      </TableHead>
      <TableBody>
        {plans.map((row) => {
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
              onClick={() => onSelect(row)}
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
              {!isPurchase ? (
                <TableCell>
                  <PlanTypeBadge type={row.plan_type} />
                </TableCell>
              ) : null}
              <TableCell className={styles.muted}>
                {isPurchase ? (
                  <>
                    {formatPaiseAsInr(row.sale_price_paise)}{' '}
                    {row.billing_interval === 'year'
                      ? '/ yr'
                      : row.billing_interval === 'one_time'
                        ? ''
                        : '/ mo'}
                    {row.discount_percent ? ` · ${row.discount_percent}% off` : ''}
                  </>
                ) : (
                  subscriptionPriceSummary(row)
                )}
              </TableCell>
              {!isPurchase ? (
                <TableCell className={styles.muted}>
                  {[row.seat_limit_admins, row.seat_limit_managers, row.seat_limit_users]
                    .filter((n) => n != null)
                    .map((n, i) => ['A', 'M', 'U'][i] + ':' + n)
                    .join(' ') || '—'}
                </TableCell>
              ) : null}
              {isPurchase ? (
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
