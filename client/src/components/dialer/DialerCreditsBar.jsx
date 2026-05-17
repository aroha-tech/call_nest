import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useDialerCredits } from '../../hooks/useDialerCredits';
import { usePermissions } from '../../hooks/usePermission';
import { PERMISSIONS } from '../../utils/permissionUtils';
import {
  computeCreditUsagePct,
  formatMinutes,
  formatPaiseAsInr,
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
 * Compact telephony credits / usage strip for dialer pages.
 * @param {'default' | 'dark'} variant — dark matches DialerSessionPage cockpit
 */
export function DialerCreditsBar({
  variant = 'default',
  compact = false,
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

  const canOpenSettings = canAny([
    PERMISSIONS.BILLING_CREDITS_VIEW,
    PERMISSIONS.SETTINGS_MANAGE,
    PERMISSIONS.TELEPHONY_ACCOUNTS_MANAGE,
  ]);

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
        planLabel: 'Pay per minute',
        balancePaise,
        belowMin,
        minBal,
        ratePaise: cfg.ratePaisePerMinute,
        isBYO: cfg.isBYO,
        monthSpend: usage?.this_month?.spend_paise || 0,
        monthMinutes: usage?.this_month?.minutes || 0,
        monthCalls: usage?.this_month?.calls || 0,
        usedPct,
        level,
        showUsageBar: usedPct != null,
      };
    }

    const usedPct = cap?.enabled ? cap.used_pct : null;
    const level = getUsageLevel(usedPct, { exceeded: cap?.exceeded });
    return {
      mode: 'unlimited',
      planLabel: cap?.enabled ? 'Unlimited · capped' : 'Unlimited',
      cap,
      monthMinutes: usage?.this_month?.minutes || 0,
      monthCalls: usage?.this_month?.calls || 0,
      todayMinutes: usage?.today?.minutes || 0,
      usedPct,
      level,
      showUsageBar: cap?.enabled && usedPct != null,
    };
  }, [balance, usage]);

  if (!canLoad || forbidden) return null;
  if (!loading && !model) return null;

  const barClass = [
    styles.bar,
    variant === 'dark' ? styles.barDark : '',
    compact ? styles.barCompact : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={barClass} role="status" aria-label="Call credits and usage">
      {loading && !model ? (
        <span className={styles.loading}>Loading credits…</span>
      ) : model ? (
        <>
          <div className={styles.group}>
            <span className={styles.planBadge}>{model.planLabel}</span>
            {model.mode === 'credit' ? (
              <>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Balance</span>
                  <span
                    className={`${styles.statValue} ${model.belowMin ? styles.balanceLow : ''}`.trim()}
                  >
                    {formatPaiseAsInr(model.balancePaise)}
                  </span>
                  {model.belowMin ? (
                    <span className={styles.statHint}>
                      Below minimum {formatPaiseAsInr(model.minBal)} — calls blocked
                    </span>
                  ) : (
                    <span className={styles.statHint}>
                      {formatPaiseAsInr(model.ratePaise)} / min
                      {model.isBYO ? ' · BYO fee' : ''}
                    </span>
                  )}
                </div>
                <span className={styles.divider} aria-hidden />
                <div className={styles.stat}>
                  <span className={styles.statLabel}>This month</span>
                  <span className={styles.statValue}>
                    {formatPaiseAsInr(model.monthSpend)}
                  </span>
                  <span className={styles.statHint}>
                    {formatMinutes(model.monthMinutes)} · {model.monthCalls} calls
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>This month</span>
                  <span className={styles.statValue}>{formatMinutes(model.monthMinutes)}</span>
                  <span className={styles.statHint}>{model.monthCalls} connected calls</span>
                </div>
                {model.cap?.enabled ? (
                  <>
                    <span className={styles.divider} aria-hidden />
                    <div className={styles.stat}>
                      <span className={styles.statLabel}>Monthly cap</span>
                      <span className={styles.statValue}>
                        {model.cap.used_minutes} / {model.cap.cap_minutes_per_month} min
                      </span>
                      {model.cap.exceeded ? (
                        <span className={styles.statHint}>Cap reached — new calls blocked</span>
                      ) : (
                        <span className={styles.statHint}>
                          {model.cap.remaining_minutes} min remaining
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <span className={styles.divider} aria-hidden />
                    <div className={styles.stat}>
                      <span className={styles.statLabel}>Today</span>
                      <span className={styles.statValue}>{formatMinutes(model.todayMinutes)}</span>
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {model.showUsageBar ? (
            <div className={styles.usageBlock}>
              <div className={styles.usageHead}>
                <span className={styles.statLabel}>
                  {model.mode === 'credit' ? 'Credits used' : 'Cap usage'}
                </span>
                <span className={`${styles.usagePct} ${pctClass(model.level)}`}>
                  {model.usedPct}%
                </span>
              </div>
              <div className={styles.track} aria-hidden>
                <div
                  className={`${styles.fill} ${fillClass(model.level)}`}
                  style={{ width: `${Math.min(100, model.usedPct || 0)}%` }}
                />
              </div>
            </div>
          ) : null}

          {canOpenSettings ? (
            <>
              <span className={styles.spacer} />
              <Link to="/settings/telephony" className={styles.settingsLink}>
                Telephony settings
              </Link>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
