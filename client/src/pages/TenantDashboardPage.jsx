import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppSelector } from '../app/hooks';
import { selectUser } from '../features/auth/authSelectors';
import { usePermissions } from '../hooks/usePermission';
import { tenantDashboardAPI } from '../services/tenantAPI';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { PERMISSIONS } from '../utils/permissionUtils';
import styles from './TenantDashboardPage.module.scss';
import platformStyles from './PlatformDashboardPage.module.scss';

const ROLE_LABELS = {
  admin: 'Admin',
  manager: 'Manager',
  agent: 'Agent',
};

const ROLE_ORDER = ['admin', 'manager', 'agent'];

function StatCard({ value, label, to, icon, accent }) {
  const inner = (
    <>
      <div className={platformStyles.kpiIcon}>{icon}</div>
      <div className={platformStyles.kpiContent}>
        <span className={platformStyles.kpiValue}>{value}</span>
        <span className={platformStyles.kpiLabel}>{label}</span>
      </div>
      <span className={platformStyles.kpiArrow}>→</span>
    </>
  );
  if (to) {
    return (
      <Link to={to} className={`${platformStyles.kpiCard} ${accent ? platformStyles[accent] : ''}`}>
        {inner}
      </Link>
    );
  }
  return (
    <div className={`${platformStyles.kpiCard} ${accent ? platformStyles[accent] : ''}`}>
      {inner}
    </div>
  );
}

function buildShortcuts(canPerm, canAnyPerm, role) {
  const items = [];
  if (canAnyPerm([PERMISSIONS.USERS_MANAGE, PERMISSIONS.USERS_TEAM])) {
    items.push({ to: '/users', label: 'Users', desc: 'Team & roles', icon: '👥' });
  }
  if (canPerm(PERMISSIONS.LEADS_READ)) {
    items.push({ to: '/leads', label: 'Leads', desc: 'Pipeline & leads', icon: '🎯' });
  }
  if (canPerm(PERMISSIONS.CONTACTS_READ)) {
    items.push({ to: '/contacts', label: 'Contacts', desc: 'People & companies', icon: '📇' });
  }
  if (canAnyPerm([PERMISSIONS.CONTACTS_READ, PERMISSIONS.LEADS_READ])) {
    items.push({ to: '/campaigns', label: 'Campaigns', desc: 'Segments & outreach', icon: '📣' });
  }
  if (canPerm(PERMISSIONS.DIAL_EXECUTE)) {
    items.push({ to: '/activities', label: 'Activities', desc: 'Calls & tasks', icon: '☎️' });
  }
  if (canPerm(PERMISSIONS.DISPOSITIONS_MANAGE)) {
    items.push({ to: '/workflow/dispositions', label: 'Dispositions', desc: 'Dialer workflow', icon: '📞' });
  }
  if (canPerm(PERMISSIONS.SETTINGS_MANAGE)) {
    items.push({ to: '/settings', label: 'Settings', desc: 'Workspace configuration', icon: '⚙️' });
  }
  if (role === 'manager' && items.length === 0) {
    items.push({ to: '/leads', label: 'Leads', desc: 'Get started', icon: '🎯' });
  }
  return items;
}

export function TenantDashboardPage() {
  const user = useAppSelector(selectUser);
  const { can, canAny } = usePermissions();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const role = user?.role ?? 'agent';

  useEffect(() => {
    let mounted = true;
    tenantDashboardAPI
      .get()
      .then((res) => {
        if (mounted) setData(res.data?.data ?? null);
      })
      .catch((err) => {
        if (mounted) setError(err.response?.data?.error || err.message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const shortcuts = useMemo(
    () => buildShortcuts(can, canAny, role),
    [can, canAny, role]
  );

  if (loading) {
    return (
      <div className={platformStyles.wrapper}>
        <PageHeader title="Dashboard" description="Loading workspace overview" />
        <div className={platformStyles.loading}>
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={platformStyles.wrapper}>
        <PageHeader title="Dashboard" description="Workspace overview" />
        <div className={platformStyles.error}>{error}</div>
      </div>
    );
  }

  const scope = data?.scope ?? 'self';
  const usersTotal = data?.usersTotal ?? 0;
  const usersByRole = data?.usersByRole ?? {};

  return (
    <div className={platformStyles.wrapper}>
      <PageHeader
        title="Dashboard"
        description={data?.headline ?? 'Workspace health and quick access'}
      />

      <section className={platformStyles.kpiSection}>
        {scope === 'tenant' && (
          <>
            <StatCard
              value={usersTotal}
              label="Users"
              to="/users"
              icon="👥"
              accent="primary"
            />
            <StatCard
              value={data?.leadsTotal ?? 0}
              label="Leads"
              to="/leads"
              icon="🎯"
              accent="secondary"
            />
            <StatCard
              value={data?.contactsTotal ?? 0}
              label="Contacts"
              to="/contacts"
              icon="📇"
            />
            <StatCard
              value={data?.campaignsTotal ?? 0}
              label="Campaigns"
              to="/campaigns"
              icon="📣"
            />
          </>
        )}
        {scope === 'team' && (
          <>
            <StatCard
              value={usersByRole.agent ?? 0}
              label="Direct reports"
              to="/users"
              icon="👥"
              accent="primary"
            />
            <StatCard
              value={data?.leadsTotal ?? 0}
              label="Leads (your scope)"
              to="/leads"
              icon="🎯"
              accent="secondary"
            />
            <StatCard
              value={data?.contactsTotal ?? 0}
              label="Contacts (your scope)"
              to="/contacts"
              icon="📇"
            />
            <StatCard
              value={data?.campaignsTotal ?? 0}
              label="Campaigns"
              to="/campaigns"
              icon="📣"
            />
          </>
        )}
        {scope === 'self' && (
          <>
            <StatCard
              value={data?.leadsTotal ?? 0}
              label="My leads"
              to="/leads"
              icon="🎯"
              accent="primary"
            />
            <StatCard
              value={data?.contactsTotal ?? 0}
              label="My contacts"
              to="/contacts"
              icon="📇"
              accent="secondary"
            />
          </>
        )}
      </section>

      <div className={platformStyles.grid}>
        {(scope === 'tenant' || scope === 'team') && usersTotal > 0 && (
          <section className={platformStyles.section}>
            <div className={platformStyles.sectionHeader}>
              <h2 className={platformStyles.sectionTitle}>
                {scope === 'tenant' ? 'Users by role' : 'Your agents'}
              </h2>
              {canAny([PERMISSIONS.USERS_MANAGE, PERMISSIONS.USERS_TEAM]) && (
                <Link to="/users" className={platformStyles.sectionLink}>
                  View all
                </Link>
              )}
            </div>
            <div className={platformStyles.roleCard}>
              {(scope === 'team' ? ['agent'] : ROLE_ORDER).map((r) => {
                const count = usersByRole?.[r] ?? 0;
                const pct = usersTotal > 0 ? (count / usersTotal) * 100 : 0;
                return (
                  <div key={r} className={platformStyles.roleRow}>
                    <div className={platformStyles.roleMeta}>
                      <span className={platformStyles.roleLabel}>{ROLE_LABELS[r]}</span>
                      <span className={platformStyles.roleCount}>{count}</span>
                    </div>
                    <div className={platformStyles.roleBarWrap}>
                      <div
                        className={platformStyles.roleBar}
                        style={{ width: `${pct}%` }}
                        title={`${count} (${pct.toFixed(0)}%)`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className={platformStyles.section}>
          <h2 className={platformStyles.sectionTitle}>Quick actions</h2>
          <div className={platformStyles.shortcuts}>
            {shortcuts.map((s) => (
              <Link key={s.to} to={s.to} className={platformStyles.shortcut}>
                <span className={platformStyles.shortcutIcon}>{s.icon}</span>
                <div className={platformStyles.shortcutText}>
                  <span className={platformStyles.shortcutLabel}>{s.label}</span>
                  <span className={platformStyles.shortcutDesc}>{s.desc}</span>
                </div>
                <span className={platformStyles.shortcutArrow}>→</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {(scope === 'tenant' || scope === 'team') && (
        <div className={styles.recentWrap}>
          <section className={platformStyles.section}>
            <div className={platformStyles.sectionHeader}>
              <h2 className={platformStyles.sectionTitle}>
                {scope === 'team' ? 'Recent agents' : 'Recent users'}
              </h2>
              {canAny([PERMISSIONS.USERS_MANAGE, PERMISSIONS.USERS_TEAM]) && (
                <Link to="/users" className={platformStyles.sectionLink}>
                  View all
                </Link>
              )}
            </div>
            <div className={platformStyles.recentCard}>
              {!data?.recentUsers?.length ? (
                <p className={platformStyles.recentEmpty}>
                  {scope === 'team' ? 'No agents yet' : 'No users yet'}
                </p>
              ) : (
                <ul className={platformStyles.recentList}>
                  {data.recentUsers.map((u) => (
                    <li key={u.id} className={platformStyles.recentItem}>
                      <Link to="/users" className={platformStyles.recentLink}>
                        <span className={platformStyles.recentName}>
                          {u.name?.trim() || u.email}
                        </span>
                        <span className={platformStyles.recentMeta}>{u.role}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
