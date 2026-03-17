import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { dashboardAPI, tenantsAPI, usersAPI } from '../services/adminAPI';
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
  const [stats, setStats] = useState(null);
  const [recentTenants, setRecentTenants] = useState([]);
  const [recentUsers, setRecentUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      dashboardAPI.getStats(),
      tenantsAPI.getAll({ page: 1, limit: 5 }).catch(() => ({ data: { data: [], pagination: {} } })),
      usersAPI.getAll({ page: 1, limit: 5 }).catch(() => ({ data: { data: [], pagination: {} } })),
    ])
      .then(([statsRes, tenantsRes, usersRes]) => {
        if (!mounted) return;
        setStats(statsRes.data?.data || null);
        setRecentTenants(tenantsRes.data?.data || []);
        setRecentUsers(usersRes.data?.data || []);
      })
      .catch((err) => {
        if (mounted) setError(err.response?.data?.error || err.message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

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

  return (
    <div className={styles.wrapper}>
      <PageHeader
        title="Dashboard"
        description="Platform health and quick access"
      />

      {/* KPI row */}
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
