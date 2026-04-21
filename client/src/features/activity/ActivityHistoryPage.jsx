import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAppSelector } from '../../app/hooks';
import { selectUser } from '../auth/authSelectors';
import { PageHeader } from '../../components/ui/PageHeader';
import { SearchInput } from '../../components/ui/SearchInput';
import { Pagination } from '../../components/ui/Pagination';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { MaterialSymbol } from '../../components/ui/MaterialSymbol';
import { tenantDashboardAPI } from '../../services/tenantAPI';
import { formatDateTimeDisplay, formatRelativeTimeShort } from '../../utils/dateTimeDisplay';
import { useTableLoadingState } from '../../hooks/useTableLoadingState';
import { TableDataRegion } from '../../components/admin/TableDataRegion';
import masterStyles from '../disposition/components/MasterCRUDPage.module.scss';
import listStyles from '../../components/admin/adminDataList.module.scss';
import {
  ACTIVITY_KIND_LABEL,
  ROLE_LABELS,
  activityIconForKind,
  activityTabsForRole,
  avatarHueFromString,
  initialsFromName,
  statusBadgeForActivity,
  valueColumnForActivity,
} from './activityFeedDisplay';
import dashStyles from '../../pages/TenantDashboardPage.module.scss';
import styles from './ActivityHistoryPage.module.scss';

function normalizeTabFromParams(searchParams, role) {
  const raw = String(searchParams.get('tab') || 'all').toLowerCase();
  const allowed = new Set(['all', 'calls', 'records', 'team']);
  let t = allowed.has(raw) ? raw : 'all';
  if (t === 'team' && role === 'agent') t = 'all';
  return t;
}

function statusVariantToBadgeVariant(variant) {
  const m = {
    teal: 'success',
    blue: 'primary',
    purple: 'primary',
    amber: 'warning',
    rose: 'danger',
    slate: 'muted',
  };
  return m[variant] || 'muted';
}

export function ActivityHistoryPage() {
  const navigate = useNavigate();
  const user = useAppSelector(selectUser);
  const role = user?.role ?? 'agent';
  const dtMode = user?.datetimeDisplayMode ?? 'ist_fixed';
  const [searchParams, setSearchParams] = useSearchParams();

  const activityTab = useMemo(() => normalizeTabFromParams(searchParams, role), [searchParams, role]);
  const tabOptions = useMemo(() => activityTabsForRole(role), [role]);

  useEffect(() => {
    if (role !== 'agent') return;
    if (searchParams.get('tab') !== 'team') return;
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete('tab');
        return p;
      },
      { replace: true }
    );
  }, [role, searchParams, setSearchParams]);

  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit) || 1), [total, limit]);
  const { hasCompletedInitialFetch } = useTableLoadingState(loading);

  function setActivityTab(next) {
    const t = next === 'team' && role === 'agent' ? 'all' : next;
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (t === 'all') p.delete('tab');
        else p.set('tab', t);
        return p;
      },
      { replace: true }
    );
    setPage(1);
  }

  useEffect(() => {
    setPage(1);
  }, [activityTab]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    tenantDashboardAPI
      .getActivity({
        params: {
          page,
          limit,
          tab: activityTab,
          ...(searchQuery.trim() ? { q: searchQuery.trim() } : {}),
        },
      })
      .then((res) => {
        if (!mounted) return;
        setRows(res.data?.data ?? []);
        setTotal(Number(res.data?.total ?? 0));
        setError(null);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.response?.data?.error || err.message);
        setRows([]);
        setTotal(0);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [page, limit, searchQuery, activityTab]);

  return (
    <div className={masterStyles.page}>
      <PageHeader
        title="Activity history"
        description="Workspace activity log (same visibility as your dashboard)."
        breadcrumbs={
          <Link to="/" className={styles.crumb}>
            Dashboard
          </Link>
        }
      />

      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={listStyles.tableCard}>
        <div className={listStyles.tableCardToolbarTop}>
          <div className={styles.toolbarTabs}>
            <div className={dashStyles.activityTabs} role="tablist" aria-label="Filter activity">
              {tabOptions.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={activityTab === t.id}
                  className={`${dashStyles.activityTab} ${activityTab === t.id ? dashStyles.activityTabActive : ''}`.trim()}
                  onClick={() => setActivityTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <SearchInput
            value={searchQuery}
            onSearch={(v) => {
              setSearchQuery(v);
              setPage(1);
            }}
            placeholder="Search activity… (press Enter)"
            className={listStyles.searchInToolbar}
          />
        </div>

        <TableDataRegion loading={loading} hasCompletedInitialFetch={hasCompletedInitialFetch}>
          {rows.length === 0 ? (
            <div className={listStyles.tableCardEmpty}>
              <EmptyState
                icon={String.fromCodePoint(0x1f4cb)}
                title="No activities"
                description="Nothing matches. Try another tab or clear search."
              />
            </div>
          ) : (
            <div className={listStyles.tableCardBody}>
              <Table variant="adminList" flexibleLastColumn>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Activity</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Member</TableHeaderCell>
                    <TableHeaderCell>Info</TableHeaderCell>
                    <TableHeaderCell width="120px">When</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((it, idx) => {
                    const actor = it.actor;
                    const memberName = actor?.name || 'System';
                    const memberRole = actor?.role ? ROLE_LABELS[actor.role] || actor.role : null;
                    const { name: iconName, wrap: iconWrap } = activityIconForKind(it.kind);
                    const { label: statusLabel, variant: statusVariant } = statusBadgeForActivity(it.kind, it.title);
                    const subtitle = it.detail
                      ? it.detail
                      : memberRole
                        ? `${ACTIVITY_KIND_LABEL[it.kind] || it.kind} · ${memberRole}`
                        : ACTIVITY_KIND_LABEL[it.kind] || it.kind;
                    const hue = avatarHueFromString(memberName);
                    const key = it.id != null ? `a-${it.id}` : `${it.kind}-${it.at}-${idx}`;
                    const badgeVariant = statusVariantToBadgeVariant(statusVariant);

                    return (
                      <TableRow key={key} onClick={it.href ? () => navigate(it.href) : undefined}>
                        <TableCell noTruncate>
                          <div className={styles.activityCell}>
                            <div
                              className={`${dashStyles.activityIconWrap} ${dashStyles[iconWrap] || ''}`.trim()}
                            >
                              <MaterialSymbol name={iconName} size="sm" className={dashStyles.activityIconGlyph} />
                            </div>
                            <div className={styles.activityText}>
                              <div className={styles.activityTitle}>{it.title}</div>
                              <div className={styles.activitySub}>{subtitle}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={badgeVariant}>{statusLabel}</Badge>
                        </TableCell>
                        <TableCell noTruncate>
                          <div className={styles.memberCell}>
                            <span
                              className={styles.memberAvatar}
                              style={{
                                background: `linear-gradient(135deg, hsl(${hue}, 58%, 42%) 0%, hsl(${(hue + 40) % 360}, 52%, 32%) 100%)`,
                              }}
                              aria-hidden
                            >
                              {initialsFromName(memberName)}
                            </span>
                            <span className={styles.memberName}>
                              {memberName}
                              {memberRole ? (
                                <span className={styles.memberRole}> · {memberRole}</span>
                              ) : null}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{valueColumnForActivity(it)}</TableCell>
                        <TableCell>
                          <span className={styles.whenCell} title={formatDateTimeDisplay(it.at, dtMode)}>
                            {formatRelativeTimeShort(it.at)}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TableDataRegion>

        {hasCompletedInitialFetch ? (
          <div className={listStyles.tableCardFooterPagination}>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              limit={limit}
              onPageChange={setPage}
              onLimitChange={(next) => {
                setLimit(next);
                setPage(1);
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
