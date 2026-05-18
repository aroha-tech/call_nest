import React from 'react';
import styles from './SeatLimitsSummary.module.scss';

function fmtLimit(n) {
  if (n == null) return '∞';
  return String(n);
}

function SeatRow({ label, bundle, purchased, override, effective, usage }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{fmtLimit(bundle)}</td>
      <td>{purchased ?? 0}</td>
      <td>{override == null ? '—' : override}</td>
      <td>
        <strong>{fmtLimit(effective)}</strong>
      </td>
      <td>
        {usage ?? 0}
        {effective != null ? ` / ${effective}` : ''}
      </td>
    </tr>
  );
}

/** Read-only seat usage vs limits (tenant billing or super-admin). */
export function SeatLimitsSummary({ seatLimits, compact = false }) {
  if (!seatLimits) return null;

  const { bundle, purchased, overrides, effective, usage } = seatLimits;

  if (compact) {
    return (
      <div className={styles.compact}>
        <span>
          Admins {usage.admins}/{fmtLimit(effective.admins)}
        </span>
        <span>
          Managers {usage.managers}/{fmtLimit(effective.managers)}
        </span>
        <span>
          Agents {usage.agents}/{fmtLimit(effective.agents)}
        </span>
        <span>
          Channels {usage.channels}/{fmtLimit(effective.channels)}
        </span>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      {bundle?.plan_name ? (
        <p className={styles.planHint}>
          Bundle from plan: <strong>{bundle.plan_name}</strong>
        </p>
      ) : (
        <p className={styles.planHint}>No subscription bundle — limits come from purchased seats and overrides only.</p>
      )}
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th />
              <th>Bundle</th>
              <th>Purchased</th>
              <th>Override</th>
              <th>Effective</th>
              <th>In use</th>
            </tr>
          </thead>
          <tbody>
            <SeatRow
              label="Admins"
              bundle={bundle?.admins}
              purchased={purchased?.admins}
              override={overrides?.admins}
              effective={effective?.admins}
              usage={usage?.admins}
            />
            <SeatRow
              label="Managers"
              bundle={bundle?.managers}
              purchased={purchased?.managers}
              override={overrides?.managers}
              effective={effective?.managers}
              usage={usage?.managers}
            />
            <SeatRow
              label="Agents"
              bundle={bundle?.agents}
              purchased={purchased?.agents}
              override={overrides?.agents}
              effective={effective?.agents}
              usage={usage?.agents}
            />
            <SeatRow
              label="Channels"
              bundle={bundle?.channels}
              purchased={purchased?.channels}
              override={overrides?.channels}
              effective={effective?.channels}
              usage={usage?.channels}
            />
          </tbody>
        </table>
      </div>
    </div>
  );
}
