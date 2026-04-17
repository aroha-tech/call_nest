import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
import { PlatformDataCharts } from '../components/dashboard/DashboardDataCharts';
import { dashboardAPI, tenantsAPI, usersAPI } from '../services/adminAPI';
import { useToast } from '../context/ToastContext';
import { DateRangePresetControl } from '../components/ui/DateRangePresetControl';
import { TIME_RANGE_PRESET, computeDashboardInclusiveDates } from '../utils/dateRangePresets';
import styles from './PlatformDashboardPage.module.scss';

const ROLE_LABELS = {
  admin: 'Admin',
  manager: 'Manager',
  agent: 'Agent',
};

const ROLE_ORDER = ['admin', 'manager', 'agent'];

const SHORTCUTS = [
  { to: '/admin/tenants', label: 'Tenants', desc: 'Manage organizations', icon: '🏢' },
  { to: '/admin/users', label: 'Users', desc: 'Manage platform users', icon: '👥' },
  { to: '/admin/masters/industries', label: 'Industries', desc: 'System master data', icon: '🏭' },
  { to: '/admin/masters/dispo-types', label: 'Dispo Types', desc: 'Disposition types', icon: '📋' },
  { to: '/admin/workflow/default-dispositions', label: 'Default Dispositions', desc: 'Dialer workflow', icon: '📞' },
  { to: '/admin/workflow/default-dialing-sets', label: 'Default Dialing Sets', desc: 'Dialing configuration', icon: '⚙️' },
];

function StatCard({ value, label, to, icon, accent }) {
  return (
    <Link to={to} className={`${styles.kpiCard} ${accent ? styles[accent] : ''}`}>
      <div className={styles.kpiIcon}>{icon}</div>
      <div className={styles.kpiContent}>
        <span className={styles.kpiValue}>{value}</span>
        <span className={styles.kpiLabel}>{label}</span>
      </div>
      <span className={styles.kpiArrow}>→</span>
    </Link>
  );
}

export function PlatformDashboardPage() {
  const { showToast } = useToast();
  const [stats, setStats] = useState(null);
  const [recentTenants, setRecentTenants] = useState([]);
  const [recentUsers, setRecentUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statsRefreshing, setStatsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [rangePreset, setRangePreset] = useState(TIME_RANGE_PRESET.ALL_TIME);
  const [rangeCustomFrom, setRangeCustomFrom] = useState('');
  const [rangeCustomTo, setRangeCustomTo] = useState('');
  const [activeRange, setActiveRange] = useState(null);
  const activeRangeRef = useRef(null);
  const initialFetch = useRef(true);

  useEffect(() => {
    activeRangeRef.current = activeRange;
  }, [activeRange]);

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
    Promise.all([
      dashboardAPI.getStats(params),
      tenantsAPI.getAll({ page: 1, limit: 5 }).catch(() => ({ data: { data: [], pagination: {} } })),
      usersAPI.getAll({ page: 1, limit: 5 }).catch(() => ({ data: { data: [], pagination: {} } })),
    ])
      .then(([statsRes, tenantsRes, usersRes]) => {
        if (!mounted) return;
        setStats(statsRes.data?.data || null);
        setRecentTenants(tenantsRes.data?.data || []);
        setRecentUsers(usersRes.data?.data || []);
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
  }

  function clearDateRange() {
    setRangePreset(TIME_RANGE_PRESET.ALL_TIME);
    setRangeCustomFrom('');
    setRangeCustomTo('');
    setActiveRange(null);
    setError(null);
  }

  if (loading) {
    return (
      <div className={styles.wrapper}>
        <PageHeader title="Dashboard" description="Platform overview" />
        <div className={styles.loading}>
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.wrapper}>
        <PageHeader title="Dashboard" description="Platform overview" />
        <div className={styles.error}>{error}</div>
      </div>
    );
  }

  const usersTotal = stats?.usersTotal ?? 0;
  const dr = stats?.dateRange;
  const headerDescription = dr
    ? `Platform health and quick access · ${dr.from} → ${dr.to}`
    : 'Platform health and quick access';

  return (
    <div className={styles.wrapper}>
      <PageHeader
        title="Dashboard"
        description={headerDescription}
        actionsAlign="center"
        actions={
          <div
            className={styles.dateFilterBox}
            title="Filter KPIs and charts by when tenants and tenant users were created. Recent lists below are not filtered."
          >
            <div className={styles.dateFilterRow}>
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <DateRangePresetControl
                  variant="date"
                  preset={rangePreset}
                  onPresetChange={handleRangePresetChange}
                  customStart={rangeCustomFrom}
                  customEnd={rangeCustomTo}
                  onCustomStartChange={setRangeCustomFrom}
                  onCustomEndChange={setRangeCustomTo}
                />
              </div>
              <div className={styles.dateFilterActionsCompact}>
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
          </div>
        }
      />

      {/* KPI row + charts (date-scoped) */}
      <div className={statsRefreshing ? styles.statsRefreshing : undefined}>
      <section className={styles.kpiSection}>
        <StatCard
          value={stats?.tenantsTotal ?? 0}
          label="Tenants"
          to="/admin/tenants"
          icon="🏢"
          accent="primary"
        />
        <StatCard
          value={stats?.usersTotal ?? 0}
          label="Total Users"
          to="/admin/users"
          icon="👥"
          accent="secondary"
        />
        <StatCard
          value={stats?.usersByRole?.admin ?? 0}
          label="Admins"
          to="/admin/users"
          icon="🛡️"
        />
        <StatCard
          value={(stats?.usersByRole?.manager ?? 0) + (stats?.usersByRole?.agent ?? 0)}
          label="Managers & Agents"
          to="/admin/users"
          icon="📊"
        />
      </section>

      <PlatformDataCharts
        tenantsTotal={stats?.tenantsTotal ?? 0}
        usersTotal={stats?.usersTotal ?? 0}
        usersByRole={stats?.usersByRole ?? {}}
      />
      </div>

      <div className={styles.grid}>
        {/* Users by role */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Users by role</h2>
            <Link to="/admin/users" className={styles.sectionLink}>View all</Link>
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
                      className={styles.roleBar}
                      style={{ width: `${pct}%` }}
                      title={`${count} users (${pct.toFixed(0)}%)`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Quick actions */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Quick actions</h2>
          <div className={styles.shortcuts}>
            {SHORTCUTS.map((s) => (
              <Link key={s.to} to={s.to} className={styles.shortcut}>
                <span className={styles.shortcutIcon}>{s.icon}</span>
                <div className={styles.shortcutText}>
                  <span className={styles.shortcutLabel}>{s.label}</span>
                  <span className={styles.shortcutDesc}>{s.desc}</span>
                </div>
                <span className={styles.shortcutArrow}>→</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* Recent activity */}
      <div className={styles.recentGrid}>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Recent tenants</h2>
            <Link to="/admin/tenants" className={styles.sectionLink}>View all</Link>
          </div>
          <div className={styles.recentCard}>
            {recentTenants.length === 0 ? (
              <p className={styles.recentEmpty}>No tenants yet</p>
            ) : (
              <ul className={styles.recentList}>
                {recentTenants.map((t) => (
                  <li key={t.id} className={styles.recentItem}>
                    <Link to="/admin/tenants" className={styles.recentLink}>
                      <span className={styles.recentName}>{t.name}</span>
                      <span className={styles.recentMeta}>{t.slug}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Recent users</h2>
            <Link to="/admin/users" className={styles.sectionLink}>View all</Link>
          </div>
          <div className={styles.recentCard}>
            {recentUsers.length === 0 ? (
              <p className={styles.recentEmpty}>No users yet</p>
            ) : (
              <ul className={styles.recentList}>
                {recentUsers.map((u) => (
                  <li key={u.id} className={styles.recentItem}>
                    <Link to="/admin/users" className={styles.recentLink}>
                      <span className={styles.recentName}>{u.email}</span>
                      <span className={styles.recentMeta}>{u.tenant_name || 'Platform'} · {u.role}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
