import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { MaterialSymbol } from '../components/ui/MaterialSymbol';
import { Skeleton } from '../components/ui/Skeleton';
import { PlatformDataCharts } from '../components/dashboard/DashboardDataCharts';
import { dashboardAPI } from '../services/adminAPI';
import { useToast } from '../context/ToastContext';
import { DateRangePresetControl } from '../components/ui/DateRangePresetControl';
import {
  TIME_RANGE_PRESET,
  TIME_RANGE_PRESET_OPTIONS,
  computeDashboardInclusiveDates,
} from '../utils/dateRangePresets';
import { useDateTimeDisplay } from '../hooks/useDateTimeDisplay';
import dashStyles from './TenantDashboardPage.module.scss';
import styles from './PlatformDashboardPage.module.scss';

const ROLE_LABELS = {
  admin: 'Admin',
  manager: 'Manager',
  agent: 'Agent',
};

const ROLE_ORDER = ['admin', 'manager', 'agent'];

const PLATFORM_ROLE_BAR_FILL = {
  admin: styles.roleBarAdmin,
  manager: styles.roleBarManager,
  agent: styles.roleBarAgent,
};

const PLATFORM_KIND_LABEL = {
  tenant: 'Organization',
  user: 'User',
};

const PLATFORM_KIND_ICON = {
  tenant: 'apartment',
  user: 'group',
};

const QUICK_LINKS = [
  { to: '/admin/users', label: 'Users', mat: 'group', hint: 'Workspace users' },
  { to: '/admin/masters/industries', label: 'Industries', mat: 'factory', hint: 'Master data' },
  { to: '/admin/masters/dispo-types', label: 'Dispo types', mat: 'assignment', hint: 'Disposition types' },
  { to: '/admin/workflow/default-dispositions', label: 'Default dispos', mat: 'call', hint: 'Dialer workflow' },
  { to: '/admin/workflow/default-dialing-sets', label: 'Dialing sets', mat: 'tune', hint: 'Dialing config' },
];

function ExecutiveKpiCard({ matIcon, matWrapClass, label, value, hint, to, badge, static: isStatic }) {
  const inner = (
    <>
      <div className={dashStyles.kpiIconRow}>
        <span className={`${dashStyles.kpiMatWrap} ${matWrapClass}`}>
          <MaterialSymbol name={matIcon} size="md" />
        </span>
        {badge ? <span className={dashStyles.kpiBadge}>{badge}</span> : null}
      </div>
      <span className={dashStyles.kpiValue}>{value}</span>
      <span className={dashStyles.kpiLabel}>{label}</span>
      {hint ? <span className={dashStyles.kpiHint}>{hint}</span> : null}
    </>
  );
  const cls = `${dashStyles.kpiCard} ${isStatic ? dashStyles.kpiCardStatic : ''}`;
  if (to && !isStatic) {
    return (
      <Link to={to} className={cls}>
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}

export function PlatformDashboardPage() {
  const { formatDateTime } = useDateTimeDisplay();
  const { showToast } = useToast();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statsRefreshing, setStatsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [rangePreset, setRangePreset] = useState(TIME_RANGE_PRESET.ALL_TIME);
  const [rangeCustomFrom, setRangeCustomFrom] = useState('');
  const [rangeCustomTo, setRangeCustomTo] = useState('');
  const [activeRange, setActiveRange] = useState(null);
  const activeRangeRef = useRef(null);
  const initialFetch = useRef(true);
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false);
  const rangeWrapRef = useRef(null);

  useEffect(() => {
    activeRangeRef.current = activeRange;
  }, [activeRange]);

  useEffect(() => {
    if (!rangeMenuOpen) return;
    function handleDocMouseDown(e) {
      if (rangeWrapRef.current && !rangeWrapRef.current.contains(e.target)) {
        setRangeMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleDocMouseDown);
    return () => document.removeEventListener('mousedown', handleDocMouseDown);
  }, [rangeMenuOpen]);

  useEffect(() => {
    if (rangePreset === TIME_RANGE_PRESET.ALL_TIME) {
      setActiveRange(null);
      return;
    }
    if (rangePreset === TIME_RANGE_PRESET.CUSTOM) {
      return;
    }
    const next = computeDashboardInclusiveDates(rangePreset, '', '', new Date());
    setActiveRange(next);
  }, [rangePreset]);

  useEffect(() => {
    let mounted = true;
    const params = activeRange ? { from: activeRange.from, to: activeRange.to } : {};
    if (initialFetch.current) {
      setLoading(true);
    } else {
      setStatsRefreshing(true);
    }
    Promise.all([dashboardAPI.getStats(params)])
      .then(([statsRes]) => {
        if (!mounted) return;
        setStats(statsRes.data?.data || null);
        setError(null);
      })
      .catch((err) => {
        if (mounted) setError(err.response?.data?.error || err.message);
      })
      .finally(() => {
        if (mounted) {
          initialFetch.current = false;
          setLoading(false);
          setStatsRefreshing(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [activeRange]);

  function handleRangePresetChange(v) {
    if (v === TIME_RANGE_PRESET.CUSTOM) {
      const ar = activeRangeRef.current;
      if (ar) {
        setRangeCustomFrom(ar.from);
        setRangeCustomTo(ar.to);
      }
    }
    setRangePreset(v);
    if (v !== TIME_RANGE_PRESET.CUSTOM) {
      setRangeMenuOpen(false);
    }
  }

  function applyDateRange() {
    if (rangePreset !== TIME_RANGE_PRESET.CUSTOM) return;
    const next = computeDashboardInclusiveDates(
      TIME_RANGE_PRESET.CUSTOM,
      rangeCustomFrom,
      rangeCustomTo,
      new Date()
    );
    if (!next) {
      showToast('Pick a valid start and end date, then Apply.', 'warning');
      return;
    }
    setActiveRange(next);
    setRangeMenuOpen(false);
  }

  function clearDateRange() {
    setRangePreset(TIME_RANGE_PRESET.ALL_TIME);
    setRangeCustomFrom('');
    setRangeCustomTo('');
    setActiveRange(null);
    setError(null);
    setRangeMenuOpen(false);
  }

  const rangeLabelShort = useMemo(() => {
    if (rangePreset === TIME_RANGE_PRESET.CUSTOM && activeRange) {
      return `${activeRange.from} – ${activeRange.to}`;
    }
    const o = TIME_RANGE_PRESET_OPTIONS.find((x) => x.value === rangePreset);
    return o?.label ?? 'Range';
  }, [rangePreset, activeRange]);

  const subtitle = useMemo(() => {
    const t = stats?.tenantsTotal ?? 0;
    const u = stats?.usersTotal ?? 0;
    const dr = stats?.dateRange;
    const rangeBit = dr ? ` Date filter: ${dr.from} to ${dr.to}.` : '';
    return `Monitoring ${t.toLocaleString()} customer organizations and ${u.toLocaleString()} workspace users (excludes platform tenant).${rangeBit}`;
  }, [stats]);

  if (loading) {
    return (
      <div className={dashStyles.page}>
        <div className={styles.loading}>
          <div style={{ width: 'min(1040px, 100%)', display: 'grid', gap: 12 }}>
            <Skeleton width="32%" height={14} />
            <Skeleton width="46%" height={28} />
            <Skeleton width="62%" height={14} />
            <Skeleton width="100%" height={132} />
            <Skeleton width="100%" height={240} />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={dashStyles.page}>
        <div className={styles.error}>{error}</div>
      </div>
    );
  }

  const usersTotal = stats?.usersTotal ?? 0;
  const admins = stats?.usersByRole?.admin ?? 0;
  const managers = stats?.usersByRole?.manager ?? 0;
  const agents = stats?.usersByRole?.agent ?? 0;

  return (
    <div className={dashStyles.page}>
      <header className={dashStyles.hero}>
        <div className={dashStyles.heroTitles}>
          <p className={styles.heroKicker}>High-level health of your platform at a glance.</p>
          <h1 className={dashStyles.heroTitle}>Executive dashboard</h1>
          <p className={dashStyles.heroSubtitle}>{subtitle}</p>
        </div>
        <div className={dashStyles.heroActions}>
          <div className={dashStyles.heroToolbar}>
            <div className={dashStyles.heroToolbarRange} ref={rangeWrapRef}>
              <button
                type="button"
                className={dashStyles.rangePill}
                aria-expanded={rangeMenuOpen}
                aria-haspopup="dialog"
                onClick={() => setRangeMenuOpen((o) => !o)}
                title="Filter KPIs and charts by when tenants and tenant users were created."
              >
                <MaterialSymbol name="calendar_today" size="sm" />
                <span className={dashStyles.rangePillLabel}>{rangeLabelShort}</span>
              </button>
              {rangeMenuOpen ? (
                <div className={dashStyles.rangeDropdown} role="dialog" aria-label="Time range">
                  <DateRangePresetControl
                    tone="default"
                    variant="date"
                    preset={rangePreset}
                    onPresetChange={handleRangePresetChange}
                    customStart={rangeCustomFrom}
                    customEnd={rangeCustomTo}
                    onCustomStartChange={setRangeCustomFrom}
                    onCustomEndChange={setRangeCustomTo}
                    selectLabel="Time range"
                  />
                  <div className={dashStyles.rangeDropdownActions}>
                    {rangePreset === TIME_RANGE_PRESET.CUSTOM ? (
                      <Button
                        type="button"
                        variant="primary"
                        size="xs"
                        onClick={applyDateRange}
                        loading={statsRefreshing}
                      >
                        Apply
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      title="Clear dates and show all-time totals"
                      onClick={clearDateRange}
                      disabled={statsRefreshing}
                    >
                      Reset
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className={dashStyles.iconToolBtn}
              title="Export"
              aria-label="Export"
              onClick={() => showToast('Export will be available in a future update.', 'info')}
            >
              <MaterialSymbol name="download" size="md" />
            </button>
          </div>
        </div>
      </header>

      <div className={statsRefreshing ? dashStyles.statsRefreshing : undefined}>
        <section className={dashStyles.kpiGrid}>
          <ExecutiveKpiCard
            matIcon="apartment"
            matWrapClass={dashStyles.kpiMatLeaderboard}
            label="Tenants"
            value={(stats?.tenantsTotal ?? 0).toLocaleString()}
            hint="Customer orgs"
            to="/admin/tenants"
          />
          <ExecutiveKpiCard
            matIcon="groups"
            matWrapClass={dashStyles.kpiMatContacts}
            label="Workspace users"
            value={usersTotal.toLocaleString()}
            hint="Across all tenants"
            to="/admin/users"
          />
          <ExecutiveKpiCard
            matIcon="admin_panel_settings"
            matWrapClass={dashStyles.kpiMatCampaign}
            label="Admins"
            value={admins.toLocaleString()}
            hint="Tenant admins"
            to="/admin/users"
          />
          <ExecutiveKpiCard
            matIcon="supervisor_account"
            matWrapClass={dashStyles.kpiMatEvent}
            label="Managers"
            value={managers.toLocaleString()}
            hint="Team leads"
            to="/admin/users"
          />
          <ExecutiveKpiCard
            matIcon="support_agent"
            matWrapClass={dashStyles.kpiMatEmail}
            label="Agents"
            value={agents.toLocaleString()}
            hint="Field users"
            to="/admin/users"
          />
          <ExecutiveKpiCard
            matIcon="hub"
            matWrapClass={dashStyles.kpiMatCall}
            label="Masters & workflow"
            value="Open"
            hint="Industries, dispositions, sets"
            to="/admin/masters/industries"
          />
        </section>

        <div className={dashStyles.mainGrid}>
          <div>
            <div className={dashStyles.insightsSection} style={{ marginTop: 0 }}>
              <PlatformDataCharts
                tenantsTotal={stats?.tenantsTotal ?? 0}
                usersTotal={usersTotal}
                usersByRole={stats?.usersByRole ?? {}}
              />
            </div>

            <section className={dashStyles.panel}>
              <div className={dashStyles.panelHead}>
                <h2 className={dashStyles.panelTitleWithIcon}>
                  <span className={styles.sectionTitleIcon} aria-hidden="true">
                    <MaterialSymbol name="bar_chart" size="sm" />
                  </span>
                  Users by role
                </h2>
                <Link to="/admin/users" className={dashStyles.panelLink}>
                  View all
                </Link>
              </div>
              <div className={styles.roleCard}>
                {ROLE_ORDER.map((role) => {
                  const count = stats?.usersByRole?.[role] ?? 0;
                  const pct = usersTotal > 0 ? (count / usersTotal) * 100 : 0;
                  return (
                    <div key={role} className={styles.roleRow}>
                      <div className={styles.roleMeta}>
                        <span className={styles.roleLabel}>{ROLE_LABELS[role]}</span>
                        <span className={styles.roleCount}>{count}</span>
                      </div>
                      <div className={styles.roleBarWrap}>
                        <div
                          className={`${styles.roleBar} ${PLATFORM_ROLE_BAR_FILL[role] ?? styles.roleBarAdmin}`}
                          style={{ width: `${pct}%` }}
                          title={`${count} users (${pct.toFixed(0)}%)`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className={dashStyles.panel}>
              <div className={dashStyles.panelHead}>
                <h2 className={dashStyles.panelTitleWithIcon}>
                  <MaterialSymbol name="history" size="sm" className={dashStyles.panelTitleIcon} />
                  Platform activity
                </h2>
              </div>
              <p className={styles.platformActivityHint}>
                New organizations and workspace users (not scoped by the KPI date filter above).
              </p>
              <div className={styles.platformActivityCard}>
                {(stats?.activityFeed ?? []).length === 0 ? (
                  <p className={styles.recentEmpty}>No recent platform events yet.</p>
                ) : (
                  <ul className={styles.platformActivityList}>
                    {(stats?.activityFeed ?? []).map((it, idx) => {
                      const kindLabel = PLATFORM_KIND_LABEL[it.kind] || it.kind;
                      const key = `${it.kind}-${it.at}-${idx}`;
                      const rowInner = (
                        <>
                          <span className={styles.platformActivityTime}>{formatDateTime(it.at)}</span>
                          <div className={styles.platformActivityBody}>
                            <div className={styles.platformActivityTitleRow}>
                              <span className={styles.platformActivityChip}>
                                <MaterialSymbol
                                  name={PLATFORM_KIND_ICON[it.kind] || 'history'}
                                  size="xs"
                                  className={styles.platformActivityChipIcon}
                                />
                                {kindLabel}
                              </span>
                              <span className={styles.platformActivityTitle}>{it.title}</span>
                            </div>
                            {it.detail ? <p className={styles.platformActivityDetail}>{it.detail}</p> : null}
                          </div>
                        </>
                      );
                      return (
                        <li key={key}>
                          {it.href ? (
                            <Link to={it.href} className={styles.platformActivityRow}>
                              {rowInner}
                            </Link>
                          ) : (
                            <div
                              className={`${styles.platformActivityRow} ${styles.platformActivityRowStatic}`.trim()}
                            >
                              {rowInner}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          </div>

          <div className={dashStyles.sideStack}>
            <section className={dashStyles.panel}>
              <div className={dashStyles.panelHead}>
                <h2 className={dashStyles.panelTitleWithIcon}>
                  <MaterialSymbol name="monitor_heart" size="sm" className={dashStyles.panelTitleIcon} />
                  Platform signals
                </h2>
                <span className={dashStyles.pendingBadge}>Coming soon</span>
              </div>
              <p className={dashStyles.skeletonNote}>
                Cross-tenant health, billing hooks, and anomaly alerts will surface here. For now, use Tenants and
                Users to review activity.
              </p>
              {[1, 2, 3].map((i) => (
                <div key={i} className={dashStyles.skeletonRow}>
                  <div className={dashStyles.skeletonAvatar} />
                  <div className={dashStyles.skeletonCol}>
                    <div className={dashStyles.skeletonLine} style={{ width: '55%' }} />
                    <div className={dashStyles.skeletonLine} style={{ width: '36%' }} />
                  </div>
                </div>
              ))}
            </section>

            <section className={dashStyles.panel}>
              <div className={dashStyles.panelHead}>
                <h2 className={dashStyles.panelTitleWithIcon}>
                  <span className={styles.sectionTitleIcon} aria-hidden="true">
                    <MaterialSymbol name="bolt" size="sm" />
                  </span>
                  Quick actions
                </h2>
              </div>
              <div className={dashStyles.quickGrid}>
                <Link
                  to="/admin/tenants"
                  className={`${dashStyles.quickBtn} ${dashStyles.quickBtnCta} ${dashStyles.quickPrimary}`}
                >
                  <MaterialSymbol name="domain_add" size="md" className={dashStyles.quickBtnMat} />
                  <span>Add tenant</span>
                </Link>
                {QUICK_LINKS.map((s) => (
                  <Link key={s.to} to={s.to} className={dashStyles.quickBtn} title={s.hint}>
                    <MaterialSymbol name={s.mat} size="md" className={dashStyles.quickBtnMat} />
                    <span>{s.label}</span>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
