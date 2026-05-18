import React from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import styles from './SeatPlanPreviewCard.module.scss';

function formatPaiseAsInr(paise) {
  const n = Number(paise) / 100;
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);
}

const ROLE_LABEL = { admin: 'Admin', manager: 'Manager', agent: 'Agent' };

export function SeatPlanPreviewCard({ plan, preview = true }) {
  const role = ROLE_LABEL[plan.seat_role] || plan.seat_role || 'Seat';
  const withChannel = plan.includes_unlimited_channels === 1;

  return (
    <Card className={styles.card}>
      <h3 className={styles.name}>{plan.name}</h3>
      <Badge variant="warning" size="sm">
        {role} seat{withChannel ? ' + channel' : ''}
      </Badge>
      <p className={styles.price}>{formatPaiseAsInr(plan.sale_price_paise)}</p>
      <p className={styles.meta}>One-time · per seat purchased</p>
      {plan.description ? <p className={styles.desc}>{plan.description}</p> : null}
      <Button variant="secondary" fullWidth disabled={preview}>
        {preview ? 'Add seat' : 'Purchase'}
      </Button>
    </Card>
  );
}
