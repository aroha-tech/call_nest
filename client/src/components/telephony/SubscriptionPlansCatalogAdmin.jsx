import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
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
import {
  PAID_BILLING_INTERVALS,
  billingIntervalLabel,
  isEnterpriseTier,
  isFreeTier,
} from '../../constants/telephonyPlanCatalog';
import { groupSubscriptionPlans } from '../../utils/telephonyPlanCatalogUtils';
import { formatPaiseAsInr } from '../../utils/telephonyPlanFormUtils';
import styles from './SubscriptionPlansCatalogAdmin.module.scss';

function PlanTypeBadge({ type }) {
  return (
    <Badge variant={type === 'unlimited' ? 'success' : 'warning'}>
      {type === 'unlimited' ? 'Unlimited' : 'Credit'}
    </Badge>
  );
}

function priceCell(plan) {
  if (!plan) return '—';
  if (isEnterpriseTier(plan.subscription_tier) || plan.is_contact_sales) return 'Contact sales';
  if (isFreeTier(plan.subscription_tier)) {
    return plan.trial_duration_days ? `${plan.trial_duration_days}d trial` : 'Free';
  }
  const sale = formatPaiseAsInr(plan.sale_price_paise);
  const iv = plan.billing_interval ? ` / ${billingIntervalLabel(plan.billing_interval).toLowerCase()}` : '';
  return `${sale}${iv}`;
}

function TierPlanTable({
  tierGroup,
  planType,
  selectedId,
  onSelect,
  onEdit,
  onToggle,
  onDelete,
  onAdd,
}) {
  const { tier, label, singleton, byInterval } = tierGroup;

  if (singleton) {
    const row = singleton;
    return (
      <Table className={styles.tierTable}>
        <TableBody>
          <TableRow
            className={selectedId === row?.id ? styles.rowSelected : styles.rowClickable}
            onClick={() => row && onSelect(row)}
          >
            <TableCell>
              <strong>{label}</strong>
            </TableCell>
            <TableCell>{priceCell(row)}</TableCell>
            <TableCell>
              {row ? (
                <Badge variant={row.is_active === 1 ? 'success' : 'muted'}>
                  {row.is_active === 1 ? 'Active' : 'Inactive'}
                </Badge>
              ) : (
                '—'
              )}
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              {row ? (
                <RowActions row={row} onEdit={onEdit} onToggle={onToggle} onDelete={onDelete} />
              ) : (
                <Button size="sm" variant="ghost" onClick={() => onAdd({ planType, tier })}>
                  <MaterialSymbol name="add" size="sm" /> Add
                </Button>
              )}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
  }

  return (
    <Table className={styles.tierTable}>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Billing cycle</TableHeaderCell>
          <TableHeaderCell>Price</TableHeaderCell>
          <TableHeaderCell>Status</TableHeaderCell>
          <TableHeaderCell aria-label="Actions" />
        </TableRow>
      </TableHead>
      <TableBody>
        {PAID_BILLING_INTERVALS.map((iv) => {
          const row = byInterval[iv.value];
          return (
            <TableRow
              key={iv.value}
              className={row && selectedId === row.id ? styles.rowSelected : styles.rowClickable}
              onClick={() => row && onSelect(row)}
            >
              <TableCell>{iv.label}</TableCell>
              <TableCell>{priceCell(row)}</TableCell>
              <TableCell>
                {row ? (
                  <Badge variant={row.is_active === 1 ? 'success' : 'muted'}>
                    {row.is_active === 1 ? 'Active' : 'Inactive'}
                  </Badge>
                ) : (
                  <span className={styles.muted}>Missing</span>
                )}
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                {row ? (
                  <RowActions row={row} onEdit={onEdit} onToggle={onToggle} onDelete={onDelete} />
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onAdd({ planType, tier, billingInterval: iv.value })}
                  >
                    <MaterialSymbol name="add" size="sm" /> Add
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function RowActions({ row, onEdit, onToggle, onDelete }) {
  return (
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
  );
}

function CatalogBlock({ title, description, planType, plans, ...handlers }) {
  const tierGroups = useMemo(() => groupSubscriptionPlans(plans, planType), [plans, planType]);

  return (
    <section className={styles.block}>
      <header className={styles.blockHead}>
        <div>
          <h3 className={styles.blockTitle}>
            <PlanTypeBadge type={planType} /> {title}
          </h3>
          <p className={styles.blockDesc}>{description}</p>
        </div>
        <Button size="sm" onClick={() => handlers.onAdd({ planType, tier: 'go', billingInterval: 'month' })}>
          <MaterialSymbol name="add" size="sm" /> Add plan
        </Button>
      </header>
      <div className={styles.tierGrid}>
        {tierGroups.map((group) => (
          <div key={group.tier} className={styles.tierCard}>
            <h4 className={styles.tierName}>{group.label}</h4>
            <TierPlanTable tierGroup={group} planType={planType} {...handlers} />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Admin catalog: credit tiers (free/go/premium/enterprise) × cycles, then unlimited (go/premium).
 */
export function SubscriptionPlansCatalogAdmin({
  plans = [],
  selectedId,
  onSelect,
  onEdit,
  onToggle,
  onDelete,
}) {
  const navigate = useNavigate();

  const creditPlans = useMemo(() => plans.filter((p) => p.plan_type === 'credit'), [plans]);
  const unlimitedPlans = useMemo(() => plans.filter((p) => p.plan_type === 'unlimited'), [plans]);

  function handleAdd({ planType, tier, billingInterval }) {
    const params = new URLSearchParams();
    params.set('plan_type', planType);
    params.set('tier', tier);
    if (billingInterval) params.set('interval', billingInterval);
    navigate(`/admin/telephony-plans/subscription/new?${params.toString()}`);
  }

  const handlers = {
    selectedId,
    onSelect,
    onEdit,
    onToggle,
    onDelete,
    onAdd: handleAdd,
  };

  return (
    <div className={styles.catalog}>
      <CatalogBlock
        title="Credit-based subscriptions"
        description="Free, Go, Premium, and Enterprise (custom). Each paid tier can have monthly, quarterly, 6-month, and yearly prices."
        planType="credit"
        plans={creditPlans}
        {...handlers}
      />
      <CatalogBlock
        title="Unlimited subscriptions"
        description="Go and Premium with a monthly minute cap. Enterprise stays on credit-based custom plans."
        planType="unlimited"
        plans={unlimitedPlans}
        {...handlers}
      />
    </div>
  );
}
