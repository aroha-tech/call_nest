import React, { useMemo, useState } from 'react';
import styles from './DashboardDataCharts.module.scss';

const ROLE_ORDER = ['admin', 'manager', 'agent'];
const ROLE_LABELS = { admin: 'Admins', manager: 'Managers', agent: 'Agents' };

/** Align with pipeline horizontal bars: primary / sky / emerald. */
const DONUT_COLORS = {
  admin: 'var(--color-primary-500)',
  manager: '#0ea5e9',
  agent: '#10b981',
};

/** Clockwise donut arc; angles in degrees from top (0° = 12 o'clock). */
function donutSlicePath(cx, cy, rOuter, rInner, startDeg, endDeg) {
  if (endDeg - startDeg < 0.02) return '';
  const rad = (deg) => ((deg - 90) * Math.PI) / 180;
  const x1 = cx + rOuter * Math.cos(rad(startDeg));
  const y1 = cy + rOuter * Math.sin(rad(startDeg));
  const x2 = cx + rOuter * Math.cos(rad(endDeg));
  const y2 = cy + rOuter * Math.sin(rad(endDeg));
  const x3 = cx + rInner * Math.cos(rad(endDeg));
  const y3 = cy + rInner * Math.sin(rad(endDeg));
  const x4 = cx + rInner * Math.cos(rad(startDeg));
  const y4 = cy + rInner * Math.sin(rad(startDeg));
  const sweep = endDeg - startDeg;
  const large = sweep > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4} Z`;
}

function RoleDonutCard({ usersByRole, usersTotal, title, hint }) {
  const [hovered, setHovered] = useState(null);

  const slices = useMemo(() => {
    if (!usersTotal) return [];
    let angle = 0;
    const out = [];
    for (const role of ROLE_ORDER) {
      const n = usersByRole?.[role] ?? 0;
      if (!n) continue;
      const span = (n / usersTotal) * 360;
      out.push({ role, start: angle, end: angle + span, value: n });
      angle += span;
    }
    return out;
  }, [usersByRole, usersTotal]);

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>{title}</h3>
      <p className={styles.cardHint}>{hint}</p>
      <div className={styles.donutWrap}>
        <div className={styles.donutSvgWrap}>
          {usersTotal === 0 ? (
            <div
              className={styles.donutEmptyRing}
              role="img"
              aria-label="No users in scope"
            />
          ) : (
            <svg
              viewBox="0 0 100 100"
              className={styles.donutSvg}
              role="img"
              aria-label={`User roles distribution, ${usersTotal} total`}
              onMouseLeave={() => setHovered(null)}
            >
              {slices.map((s) => {
                const dimmed = hovered && hovered !== s.role;
                return (
                  <path
                    key={s.role}
                    d={donutSlicePath(50, 50, 44, 28, s.start, s.end)}
                    fill={DONUT_COLORS[s.role]}
                    className={`${styles.donutSeg} ${dimmed ? styles.donutSegDimmed : ''} ${
                      hovered === s.role ? styles.donutSegActive : ''
                    }`}
                    onMouseEnter={() => setHovered(s.role)}
                    onFocus={() => setHovered(s.role)}
                    onBlur={() => setHovered(null)}
                    tabIndex={0}
                    title={`${ROLE_LABELS[s.role]}: ${s.value}`}
                  />
                );
              })}
            </svg>
          )}
          <div className={styles.donutCenter}>
            <span className={styles.donutCenterValue}>{usersTotal}</span>
            <span className={styles.donutCenterHint}>users</span>
          </div>
        </div>
        <ul className={styles.legend}>
          {usersTotal === 0 ? (
            <li className={styles.legendItem}>No users in scope</li>
          ) : (
            ROLE_ORDER.map((role) => {
              const n = usersByRole?.[role] ?? 0;
              if (n === 0) return null;
              const dimmed = hovered && hovered !== role;
              return (
                <li
                  key={role}
                  className={`${styles.legendItem} ${dimmed ? styles.legendItemDimmed : ''} ${
                    hovered === role ? styles.legendItemActive : ''
                  }`}
                  onMouseEnter={() => setHovered(role)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <span
                    className={styles.legendSwatch}
                    style={{
                      background: DONUT_COLORS[role],
                    }}
                  />
                  <span className={styles.legendMeta}>
                    <span className={styles.legendLabel}>{ROLE_LABELS[role]}</span>
                    <span className={styles.legendCount}>{n}</span>
                  </span>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}

function HorizontalMetricsCard({ title, hint, rows }) {
  const [hovered, setHovered] = useState(null);
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>{title}</h3>
      <p className={styles.cardHint}>{hint}</p>
      <div className={styles.hBarBlock}>
        {rows.map((row, i) => {
          const dimmed = hovered && hovered !== row.key;
          return (
            <div
              key={row.key}
              className={`${styles.hBarRow} ${i === 1 ? styles.hBarRowAlt : ''} ${
                dimmed ? styles.hBarRowDimmed : ''
              } ${hovered === row.key ? styles.hBarRowActive : ''}`}
              onMouseEnter={() => setHovered(row.key)}
              onMouseLeave={() => setHovered(null)}
              title={`${row.label}: ${row.value}`}
            >
              <span className={styles.hBarLabel}>{row.label}</span>
              <div className={styles.hBarTrack}>
                <div
                  className={styles.hBarFill}
                  style={{ width: `${(row.value / max) * 100}%` }}
                />
              </div>
              <span className={styles.hBarValue}>{row.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SparkCompareCard({ title, hint, left, right }) {
  const [hovered, setHovered] = useState(null);
  const max = Math.max(left.value, right.value, 1);
  const hLeft = `${(left.value / max) * 100}%`;
  const hRight = `${(right.value / max) * 100}%`;

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>{title}</h3>
      <p className={styles.cardHint}>{hint}</p>
      <div className={styles.sparkArea}>
        <div
          className={`${styles.sparkBarWrap} ${hovered && hovered !== 'left' ? styles.sparkBarWrapDimmed : ''} ${
            hovered === 'left' ? styles.sparkBarWrapActive : ''
          }`}
          onMouseEnter={() => setHovered('left')}
          onMouseLeave={() => setHovered(null)}
          title={`${left.label}: ${left.value}`}
        >
          <div
            className={`${styles.sparkBar} ${hovered === 'left' ? styles.sparkBarActive : ''}`}
            style={{ height: hLeft }}
          />
        </div>
        <div
          className={`${styles.sparkBarWrap} ${hovered && hovered !== 'right' ? styles.sparkBarWrapDimmed : ''} ${
            hovered === 'right' ? styles.sparkBarWrapActive : ''
          }`}
          onMouseEnter={() => setHovered('right')}
          onMouseLeave={() => setHovered(null)}
          title={`${right.label}: ${right.value}`}
        >
          <div
            className={`${styles.sparkBar} ${styles.sparkBarAlt} ${
              hovered === 'right' ? styles.sparkBarActive : ''
            }`}
            style={{ height: hRight }}
          />
        </div>
      </div>
      <div className={styles.sparkLabels}>
        <span className={hovered && hovered !== 'left' ? styles.sparkLabelDimmed : ''}>
          {left.label}
          <br />
          <strong>{left.value}</strong>
        </span>
        <span className={hovered && hovered !== 'right' ? styles.sparkLabelDimmed : ''}>
          {right.label}
          <br />
          <strong>{right.value}</strong>
        </span>
      </div>
    </div>
  );
}

/**
 * Charts for tenant dashboard (API scope: tenant | team | self).
 */
export function TenantDataCharts({
  scope,
  leadsTotal = 0,
  contactsTotal = 0,
  campaignsTotal = 0,
  usersTotal = 0,
  usersByRole = {},
}) {
  const volumeRows = useMemo(() => {
    if (scope === 'self') {
      return [
        { key: 'leads', label: 'My leads', value: leadsTotal },
        { key: 'contacts', label: 'My contacts', value: contactsTotal },
      ];
    }
    return [
      { key: 'leads', label: 'Leads', value: leadsTotal },
      { key: 'contacts', label: 'Contacts', value: contactsTotal },
      { key: 'campaigns', label: 'Campaigns', value: campaignsTotal },
    ];
  }, [scope, leadsTotal, contactsTotal, campaignsTotal]);

  const showDonut = scope === 'tenant' || scope === 'team';

  return (
    <div className={styles.chartsGrid}>
      <HorizontalMetricsCard
        title="Pipeline volume"
        hint={
          scope === 'self'
            ? 'Counts in your assigned scope.'
            : scope === 'team'
              ? 'Team-scoped lead, contact, and campaign totals.'
              : 'Organization-wide lead, contact, and campaign totals.'
        }
        rows={volumeRows}
      />

      {showDonut ? (
        <RoleDonutCard
          usersByRole={usersByRole}
          usersTotal={usersTotal}
          title={scope === 'team' ? 'Team shape' : 'People by role'}
          hint={
            scope === 'team'
              ? 'Agents on your team (managers typically see direct reports here).'
              : 'Distribution of workspace users across admin, manager, and agent roles.'
          }
        />
      ) : (
        <SparkCompareCard
          title="My footprint"
          hint="Leads vs contacts in your scope — relative scale."
          left={{ label: 'Leads', value: leadsTotal }}
          right={{ label: 'Contacts', value: contactsTotal }}
        />
      )}
    </div>
  );
}

/**
 * Charts for platform (super admin) dashboard.
 */
export function PlatformDataCharts({ tenantsTotal = 0, usersTotal = 0, usersByRole = {} }) {
  return (
    <div className={styles.chartsGrid}>
      <SparkCompareCard
        title="Platform scale"
        hint="Organizations onboarded versus people using the platform (same height scale)."
        left={{ label: 'Tenants', value: tenantsTotal }}
        right={{ label: 'Users', value: usersTotal }}
      />
      <RoleDonutCard
        usersByRole={usersByRole}
        usersTotal={usersTotal}
        title="Users by role"
        hint="Share of admins, managers, and agents across all tenants you can see."
      />
    </div>
  );
}
