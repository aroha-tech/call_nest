import React, { useMemo } from 'react';
import { useDialerCredits } from '../../hooks/useDialerCredits';
import { usePermissions } from '../../hooks/usePermission';
import { PERMISSIONS } from '../../utils/permissionUtils';
import {
  computeCreditUsagePct,
  getUsageLevel,
} from '../../utils/callCreditsDisplay';
import styles from './DialerCreditsBar.module.scss';

function pctClass(level) {
  if (level === 'danger') return styles.usagePctDanger;
  if (level === 'warning') return styles.usagePctWarning;
  return styles.usagePctOk;
}

function fillClass(level) {
  if (level === 'danger') return styles.fillDanger;
  if (level === 'warning') return styles.fillWarning;
  return styles.fillOk;
}

/**
 * Telephony credits for dialer pages.
 * @param {'default' | 'dark'} variant
 * @param {boolean} barOnly — inline header: progress bar only (no balance, settings, or extra stats)
 */
export function DialerCreditsBar({
  variant = 'default',
  compact = false,
  barOnly = false,
  refreshIntervalMs = 0,
  className = '',
}) {
  const { canAny } = usePermissions();
  const canLoad = canAny([
    PERMISSIONS.DIAL_EXECUTE,
    PERMISSIONS.BILLING_CREDITS_VIEW,
    PERMISSIONS.SETTINGS_MANAGE,
    PERMISSIONS.TELEPHONY_ACCOUNTS_MANAGE,
  ]);

  const { balance, usage, loading, forbidden } = useDialerCredits({
    enabled: canLoad,
    refreshIntervalMs,
  });

  const model = useMemo(() => {
    if (!balance?.config) return null;
    const cfg = balance.config;
    const wallet = balance.wallet;
    const isCredit = cfg.callBillingMode === 'credit';
    const cap = usage?.unlimited_cap;

    if (isCredit) {
      const balancePaise = Number(wallet?.balance_paise) || 0;
      const minBal = Number(cfg.minBalancePaise) || 0;
      const belowMin = minBal > 0 && balancePaise < minBal;
      const usedPct = computeCreditUsagePct(wallet);
      const level = belowMin ? 'danger' : getUsageLevel(usedPct);
      return {
        mode: 'credit',
        belowMin,
        usedPct,
        level,
        showUsageBar: usedPct != null,
        barLabel: 'Credits',
      };
    }

    const usedPct = cap?.enabled ? cap.used_pct : null;
    const level = getUsageLevel(usedPct, { exceeded: cap?.exceeded });
    return {
      mode: 'unlimited',
      belowMin: cap?.exceeded,
      usedPct,
      level,
      showUsageBar: cap?.enabled && usedPct != null,
      barLabel: cap?.enabled ? 'Monthly cap' : 'Usage',
    };
  }, [balance, usage]);

  if (!canLoad || forbidden) return null;
  if (!loading && !model) return null;

  const barClass = [
    styles.bar,
    barOnly ? styles.barInline : '',
    variant === 'dark' || barOnly ? styles.barDark : '',
    compact && !barOnly ? styles.barCompact : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (barOnly) {
    if (loading && !model) {
      return (
        <div className={barClass} role="status" aria-label="Credits">
          <span className={styles.inlineLoading}>…</span>
        </div>
      );
    }
    if (!model) return null;

    if (!model.showUsageBar) {
      return (
        <div className={barClass} role="status" aria-label="Credits">
          <span className={styles.inlineLabel}>{model.barLabel}</span>
          <span className={styles.inlineMuted}>No usage meter</span>
        </div>
      );
    }

    return (
      <div className={barClass} role="status" aria-label={`${model.barLabel} usage`}>
        <span className={styles.inlineLabel}>{model.barLabel}</span>
        <div className={styles.inlineTrackWrap}>
          <div className={styles.track} aria-hidden>
            <div
              className={`${styles.fill} ${fillClass(model.level)}`}
              style={{ width: `${Math.min(100, model.usedPct || 0)}%` }}
            />
          </div>
        </div>
        <span className={`${styles.inlinePct} ${pctClass(model.level)}`}>{model.usedPct}%</span>
        {model.belowMin ? <span className={styles.inlineWarn}>Low</span> : null}
      </div>
    );
  }

  /* Legacy full strip — kept for non-dialer-flow pages if needed */
  if (loading && !model) {
    return (
      <div className={barClass} role="status" aria-label="Call credits and usage">
        <span className={styles.loading}>Loading credits…</span>
      </div>
    );
  }

  if (!model?.showUsageBar) return null;

  return (
    <div className={barClass} role="status" aria-label="Call credits and usage">
      <div className={styles.usageBlock}>
        <div className={styles.usageHead}>
          <span className={styles.statLabel}>{model.barLabel}</span>
          <span className={`${styles.usagePct} ${pctClass(model.level)}`}>{model.usedPct}%</span>
        </div>
        <div className={styles.track} aria-hidden>
          <div
            className={`${styles.fill} ${fillClass(model.level)}`}
            style={{ width: `${Math.min(100, model.usedPct || 0)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
