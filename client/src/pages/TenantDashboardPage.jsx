import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppSelector } from '../app/hooks';
import { selectUser } from '../features/auth/authSelectors';
import { usePermissions } from '../hooks/usePermission';
import { tenantDashboardAPI } from '../services/tenantAPI';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
import { SearchInput } from '../components/ui/SearchInput';
import { TenantDataCharts } from '../components/dashboard/DashboardDataCharts';
import { PERMISSIONS } from '../utils/permissionUtils';
import { useToast } from '../context/ToastContext';
import { DateRangePresetControl } from '../components/ui/DateRangePresetControl';
import { MaterialSymbol } from '../components/ui/MaterialSymbol';
import {
  TIME_RANGE_PRESET,
  TIME_RANGE_PRESET_OPTIONS,
  computeDashboardInclusiveDates,
} from '../utils/dateRangePresets';
import { formatDateTimeDisplay } from '../utils/dateTimeDisplay';
import styles from './TenantDashboardPage.module.scss';

const ROLE_LABELS = {
  admin: 'Admin',
  manager: 'Manager',
  agent: 'Agent',
};

const ROLE_ORDER = ['admin', 'manager', 'agent'];

/** Emoji as code points keeps source files ASCII-clean on Windows editors. */
const E = {
  target: String.fromCodePoint(0x1f3af),
  contacts: String.fromCodePoint(0x1f4c7),
  megaphone: String.fromCodePoint(0x1f4e3),
  calendar: String.fromCodePoint(0x1f4c5),
  mail: String.fromCodePoint(0x2709, 0xfe0f),
  phone: String.fromCodePoint(0x260e),
};

function formatDurationSec(sec) {
  if (sec == null || Number.isNaN(Number(sec))) return '—';
  const s = Math.round(Number(sec));
  if (s < 60) return `${s}s`;
  return `${(s / 60).toFixed(1)}m`;
}

function formatMeetingSlot(startAt, mode) {
  if (!startAt) return '—';
  const d = startAt instanceof Date ? startAt : new Date(startAt);
  if (Number.isNaN(d.getTime())) return '—';
  const opts = { hour: '2-digit', minute: '2-digit', hour12: true };
  if (mode !== 'browser_local') {
    return new Intl.DateTimeFormat('en-IN', { ...opts, timeZone: 'Asia/Kolkata' }).format(d);
  }
  return new Intl.DateTimeFormat(undefined, opts).format(d);
}

function contactPath(row) {
  if (!row?.contact_id) return null;
  const t = String(row.contact_type || '').toLowerCase();
  return t === 'lead' ? `/leads/${row.contact_id}` : `/contacts/${row.contact_id}`;
}

function ExecutiveKpiCard({ matIcon, matWrapClass, label, value, hint, to, badge, static: isStatic }) {
  const inner = (
    <>
      <div className={styles.kpiIconRow}>
        <span className={`${styles.kpiMatWrap} ${matWrapClass}`}>
          <MaterialSymbol name={matIcon} size="md" />
        </span>
        {badge ? <span className={styles.kpiBadge}>{badge}</span> : null}
      </div>
      <span className={styles.kpiValue}>{value}</span>
      <span className={styles.kpiLabel}>{label}</span>
      {hint ? <span className={styles.kpiHint}>{hint}</span> : null}
    </>
  );
  const cls = `${styles.kpiCard} ${isStatic ? styles.kpiCardStatic : ''}`;
  if (to && !isStatic) {
    return (
      <Link to={to} className={cls}>
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}

export function TenantDashboardPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const user = useAppSelector(selectUser);
  const { can, canAny } = usePermissions();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [rangePreset, setRangePreset] = useState(TIME_RANGE_PRESET.ALL_TIME);
  const [rangeCustomFrom, setRangeCustomFrom] = useState('');
  const [rangeCustomTo, setRangeCustomTo] = useState('');
  const [activeRange, setActiveRange] = useState(null);
  const activeRangeRef = useRef(null);
  const initialFetch = useRef(true);
  const [dashSearch, setDashSearch] = useState('');
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false);
  const rangeWrapRef = useRef(null);

  const role = user?.role ?? 'agent';
  const dtMode = user?.datetimeDisplayMode ?? 'ist_fixed';
  const canCallHistory = canAny([PERMISSIONS.DIAL_EXECUTE, PERMISSIONS.DIAL_MONITOR]);

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
      setRefreshing(true);
    }
    tenantDashboardAPI
      .get({ params })
      .then((res) => {
        if (mounted) {
          setData(res.data?.data ?? null);
          setError(null);
        }
      })
      .catch((err) => {
        if (mounted) setError(err.response?.data?.error || err.message);
      })
      .finally(() => {
        if (mounted) {
          initialFetch.current = false;
          setLoading(false);
          setRefreshing(false);
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

  const dashboardTitle = role === 'agent' ? 'My dashboard' : 'Executive dashboard';

  const subtitle = useMemo(() => {
    if (!data) return '';
    const leads = data.leadsTotal ?? 0;
    const contacts = data.contactsTotal ?? 0;
    const sum = leads + contacts;
    const dr = data.dateRange;
    const rangeBit = dr ? ` Date filter: ${dr.from} to ${dr.to}.` : '';
    if (data.scope === 'self') {
      return `${leads.toLocaleString()} leads and ${contacts.toLocaleString()} contacts in your scope.${rangeBit}`;
    }
    const ctot = data.campaignsTotal ?? 0;
    const active = data.campaignsActive ?? 0;
    return `Monitoring ${sum.toLocaleString()} records across ${ctot} campaigns (${active} active).${rangeBit}`;
  }, [data]);

  const rangeLabelShort = useMemo(() => {
    if (rangePreset === TIME_RANGE_PRESET.CUSTOM && activeRange) {
      return `${activeRange.from} – ${activeRange.to}`;
    }
    const o = TIME_RANGE_PRESET_OPTIONS.find((x) => x.value === rangePreset);
    return o?.label ?? 'Range';
  }, [rangePreset, activeRange]);

  function onDashboardSearch(q) {
    const term = String(q || '').trim();
    if (canCallHistory) {
      navigate(term ? `/calls/history?q=${encodeURIComponent(term)}` : '/calls/history');
      return;
    }
    if (can(PERMISSIONS.LEADS_READ)) {
      navigate('/leads');
      if (term) showToast('Search from the Leads list, or use Call history if you have access.', 'info');
      return;
    }
    showToast('You do not have a search destination available.', 'warning');
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.error}>{error}</div>
      </div>
    );
  }

  const scope = data?.scope ?? 'self';
  const usersTotal = data?.usersTotal ?? 0;
  const usersByRole = data?.usersByRole ?? {};
  const upcomingMeetings = data?.upcomingMeetings ?? [];
  const recentConnectedCalls = data?.recentConnectedCalls ?? [];
  const callsToday = data?.callsToday ?? { count: 0, avgDurationSec: null };
  const meetingsMetric = data?.meetingsMetric ?? 0;
  const emailsTotal = data?.emailsTotal ?? 0;
  const campaignsActive = data?.campaignsActive;

  const canMeetings = can(PERMISSIONS.MEETINGS_VIEW);
  const canDial = can(PERMISSIONS.DIAL_EXECUTE);
  const canEmail = can(PERMISSIONS.EMAIL_VIEW);
  const showCampaignKpi = data?.campaignsTotal != null;

  const avgToday =
    callsToday.avgDurationSec != null ? formatDurationSec(callsToday.avgDurationSec) : '—';

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <div className={styles.searchWrap}>
          <SearchInput
            value={dashSearch}
            onChange={(e) => setDashSearch(e.target.value)}
            placeholder="Search leads, tasks, or insights... (Enter)"
            onSearch={onDashboardSearch}
          />
        </div>
      </div>

      <header className={styles.hero}>
        <div className={styles.heroTitles}>
          <h1 className={styles.heroTitle}>{dashboardTitle}</h1>
          <p className={styles.heroSubtitle}>{subtitle}</p>
        </div>
        <div className={styles.heroActions}>
          <div className={styles.heroToolbar}>
            <div
              className={styles.heroToolbarRange}
              ref={rangeWrapRef}
              title="Filter KPIs and charts by record creation date (inclusive)."
            >
              <button
                type="button"
                className={styles.rangePill}
                aria-expanded={rangeMenuOpen}
                aria-haspopup="dialog"
                onClick={() => setRangeMenuOpen((o) => !o)}
              >
                <MaterialSymbol name="calendar_today" size="sm" />
                <span className={styles.rangePillLabel}>{rangeLabelShort}</span>
              </button>
              {rangeMenuOpen ? (
                <div className={styles.rangeDropdown} role="dialog" aria-label="Time range">
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
                  <div className={styles.rangeDropdownActions}>
                    {rangePreset === TIME_RANGE_PRESET.CUSTOM ? (
                      <Button
                        type="button"
                        variant="primary"
                        size="xs"
                        onClick={applyDateRange}
                        loading={refreshing}
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
                      disabled={refreshing}
                    >
                      Reset
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className={styles.iconToolBtn}
              title="Export PDF"
              aria-label="Export PDF"
              onClick={() => showToast('PDF export will be available in a future update.', 'info')}
            >
              <MaterialSymbol name="download" size="md" />
            </button>
          </div>
        </div>
      </header>

      <div className={refreshing ? styles.statsRefreshing : undefined}>
        <section className={styles.kpiGrid}>
          <ExecutiveKpiCard
            matIcon="leaderboard"
            matWrapClass={styles.kpiMatLeaderboard}
            label="New leads"
            value={(data?.leadsTotal ?? 0).toLocaleString()}
            to="/leads"
          />
          <ExecutiveKpiCard
            matIcon="contacts"
            matWrapClass={styles.kpiMatContacts}
            label="Contacts"
            value={(data?.contactsTotal ?? 0).toLocaleString()}
            to="/contacts"
          />
          {showCampaignKpi ? (
            <ExecutiveKpiCard
              matIcon="campaign"
              matWrapClass={styles.kpiMatCampaign}
              label="Campaigns"
              value={(campaignsActive ?? 0).toLocaleString()}
              hint={`${data?.campaignsTotal ?? 0} total`}
              to="/campaigns"
              badge="Active"
            />
          ) : (
            <ExecutiveKpiCard
              matIcon="campaign"
              matWrapClass={styles.kpiMatCampaign}
              label="Campaigns"
              value="—"
              hint="Not shown for your role"
              static
            />
          )}
          <ExecutiveKpiCard
            matIcon="event"
            matWrapClass={styles.kpiMatEvent}
            label="Meetings"
            value={meetingsMetric.toLocaleString()}
            hint={data?.dateRange ? 'Starts in range' : 'Upcoming scheduled'}
            to={canMeetings ? '/email/meetings' : undefined}
            static={!canMeetings}
          />
          <ExecutiveKpiCard
            matIcon="email"
            matWrapClass={styles.kpiMatEmail}
            label="Emails sent"
            value={emailsTotal.toLocaleString()}
            hint={canEmail ? 'Outbound, sent' : 'No email access'}
            to={canEmail ? '/email' : undefined}
            static={!canEmail}
          />
          <ExecutiveKpiCard
            matIcon="call"
            matWrapClass={styles.kpiMatCall}
            label="Calls logged"
            value={(callsToday.count ?? 0).toLocaleString()}
            hint={`Today, ${avgToday} avg`}
            to={canCallHistory ? '/calls/history' : undefined}
            static={!canCallHistory}
          />
        </section>

        <div className={styles.mainGrid}>
          <div>
            {canMeetings ? (
              <section className={styles.panel}>
                <div className={styles.panelHead}>
                  <h2 className={styles.panelTitleWithIcon}>
                    <MaterialSymbol name="event_upcoming" size="sm" className={styles.panelTitleIcon} />
                    Upcoming meetings
                  </h2>
                  <Link to="/email/meetings" className={styles.panelLink}>
                    Calendar
                  </Link>
                </div>
                {!upcomingMeetings.length ? (
                  <p className={styles.skeletonNote}>No upcoming meetings in your scope.</p>
                ) : (
                  <ul className={styles.meetingList}>
                    {upcomingMeetings.map((m) => {
                      const joinUrl =
                        m.location && /^https?:\/\//i.test(String(m.location).trim())
                          ? String(m.location).trim()
                          : null;
                      return (
                        <li key={m.id} className={styles.meetingRow}>
                          <span className={styles.meetingTime}>{formatMeetingSlot(m.start_at, dtMode)}</span>
                          <div className={styles.meetingBody}>
                            <p className={styles.meetingTitle}>{m.title || 'Meeting'}</p>
                            <p className={styles.meetingMeta}>
                              {[m.attendee_email, m.location && !joinUrl ? m.location : null]
                                .filter(Boolean)
                                .join(' | ') || '—'}
                            </p>
                          </div>
                          {joinUrl ? (
                            <a
                              href={joinUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.joinBtn}
                            >
                              <span className={styles.joinBtnInner}>
                                <MaterialSymbol name="video_call" size="sm" />
                                Join
                              </span>
                            </a>
                          ) : (
                            <Link to="/email/meetings" className={styles.joinBtn}>
                              <span className={styles.joinBtnInner}>
                                <MaterialSymbol name="event" size="sm" />
                                Open
                              </span>
                            </Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ) : null}

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <h2 className={styles.panelTitleWithIcon}>
                  <MaterialSymbol name="phone_callback" size="sm" className={styles.panelTitleIcon} />
                  Connected calls
                </h2>
                <div className={styles.callsHeadStats}>
                  <span className={styles.callStatPill}>{callsToday.count ?? 0} today</span>
                  <span className={styles.callStatPill}>{avgToday} avg</span>
                </div>
              </div>
              {!recentConnectedCalls.length ? (
                <p className={styles.skeletonNote}>No connected calls in your scope yet.</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.dataTable}>
                    <thead>
                      <tr>
                        <th>Lead / contact</th>
                        <th>Duration</th>
                        <th>Disposition</th>
                        <th>Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentConnectedCalls.map((row) => {
                        const cp = contactPath(row);
                        return (
                          <tr key={row.id}>
                            <td>
                              {cp ? (
                                <Link to={cp} className={styles.leadLink}>
                                  {row.display_name?.trim() || `Contact #${row.contact_id}`}
                                </Link>
                              ) : (
                                row.display_name?.trim() || '—'
                              )}
                            </td>
                            <td>{formatDurationSec(row.duration_sec)}</td>
                            <td>
                              <span className={styles.dispoPill}>
                                {row.disposition_name?.trim() || '—'}
                              </span>
                            </td>
                            <td>{formatDateTimeDisplay(row.started_at, dtMode)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {canCallHistory ? (
                <Link
                  to="/calls/history"
                  className={styles.panelLink}
                  style={{ marginTop: 12, display: 'inline-block' }}
                >
                  Full call history {'\u2192'}
                </Link>
              ) : null}
            </section>
          </div>

          <div className={styles.sideStack}>
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <h2 className={styles.panelTitleWithIcon}>
                  <MaterialSymbol name="ring_volume" size="sm" className={styles.panelTitleIcon} />
                  Pending callbacks
                </h2>
                <span className={styles.pendingBadge}>Coming soon</span>
              </div>
              <p className={styles.skeletonNote}>
                This module will list follow-ups and missed calls assigned to you or your team. The activity engine is
                next; for now, use Call history and your dialer queue.
              </p>
              {[1, 2, 3].map((i) => (
                <div key={i} className={styles.skeletonRow}>
                  <div className={styles.skeletonAvatar} />
                  <div className={styles.skeletonCol}>
                    <div className={styles.skeletonLine} style={{ width: '55%' }} />
                    <div className={styles.skeletonLine} style={{ width: '36%' }} />
                  </div>
                </div>
              ))}
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <h2 className={styles.panelTitle}>Quick actions</h2>
              </div>
              <div className={styles.quickGrid}>
                {can(PERMISSIONS.LEADS_CREATE) ? (
                  <Link to="/leads" className={`${styles.quickBtn} ${styles.quickBtnCta} ${styles.quickPrimary}`}>
                    <MaterialSymbol name="person_add" size="md" className={styles.quickBtnMat} />
                    <span>Add lead</span>
                  </Link>
                ) : (
                  <Link to="/leads" className={`${styles.quickBtn} ${styles.quickBtnCta} ${styles.quickPrimary}`}>
                    <MaterialSymbol name="person_add" size="md" className={styles.quickBtnMat} />
                    <span>View leads</span>
                  </Link>
                )}
                {canAny([PERMISSIONS.LEADS_READ, PERMISSIONS.CONTACTS_READ]) ? (
                  <Link to="/campaigns" className={styles.quickBtn}>
                    <MaterialSymbol name="send" size="md" className={styles.quickBtnMat} />
                    <span>Start campaign</span>
                  </Link>
                ) : null}
                {canDial ? (
                  <Link to="/dialer" className={styles.quickBtn}>
                    <MaterialSymbol name="phone_forwarded" size="md" className={styles.quickBtnMat} />
                    <span>Log call</span>
                  </Link>
                ) : canCallHistory ? (
                  <Link to="/calls/history" className={styles.quickBtn}>
                    <MaterialSymbol name="phone_forwarded" size="md" className={styles.quickBtnMat} />
                    <span>Call history</span>
                  </Link>
                ) : null}
                {canMeetings ? (
                  <Link to="/email/meetings" className={styles.quickBtn}>
                    <MaterialSymbol name="calendar_month" size="md" className={styles.quickBtnMat} />
                    <span>Meeting</span>
                  </Link>
                ) : null}
              </div>
            </section>
          </div>
        </div>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Recent activity</h2>
            <div className={styles.activityTabs} aria-hidden>
              <span className={`${styles.activityTab} ${styles.activityTabActive}`}>All</span>
              <span className={styles.activityTab}>Calls</span>
              <span className={styles.activityTab}>Agents</span>
            </div>
          </div>
          <p className={styles.skeletonNote}>
            A unified timeline (calls, emails, WhatsApp, and notes) is in progress. Open a contact or lead to see full
            activity today.
          </p>
          <div className={styles.skeletonBlock}>
            <div className={styles.skeletonLine} style={{ width: '100%' }} />
            <div className={styles.skeletonLine} style={{ width: '92%' }} />
            <div className={styles.skeletonLine} style={{ width: '88%' }} />
            <div className={styles.skeletonLine} style={{ width: '95%' }} />
          </div>
          <span className={styles.footerLink} title="Coming soon">
            See full activity history (soon)
          </span>
        </section>

        <div className={styles.insightsSection}>
          <TenantDataCharts
            scope={scope}
            leadsTotal={data?.leadsTotal ?? 0}
            contactsTotal={data?.contactsTotal ?? 0}
            campaignsTotal={data?.campaignsTotal ?? 0}
            usersTotal={usersTotal}
            usersByRole={usersByRole}
          />
        </div>

        {(scope === 'tenant' || scope === 'team') && usersTotal > 0 ? (
          <div className={styles.secondaryGrid}>
            <section>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>
                  {scope === 'tenant' ? 'Users by role' : 'Your agents'}
                </h2>
                {canAny([PERMISSIONS.USERS_MANAGE, PERMISSIONS.USERS_TEAM]) ? (
                  <Link to="/users" className={styles.sectionLink}>
                    View all
                  </Link>
                ) : null}
              </div>
              <div className={styles.roleCard}>
                {(scope === 'team' ? ['agent'] : ROLE_ORDER).map((r) => {
                  const count = usersByRole?.[r] ?? 0;
                  const pct = usersTotal > 0 ? (count / usersTotal) * 100 : 0;
                  return (
                    <div key={r} className={styles.roleRow}>
                      <div className={styles.roleMeta}>
                        <span className={styles.roleLabel}>{ROLE_LABELS[r]}</span>
                        <span className={styles.roleCount}>{count}</span>
                      </div>
                      <div className={styles.roleBarWrap}>
                        <div
                          className={styles.roleBar}
                          style={{ width: `${pct}%` }}
                          title={`${count} (${pct.toFixed(0)}%)`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>
                  {scope === 'team' ? 'Recent agents' : 'Recent users'}
                </h2>
                {canAny([PERMISSIONS.USERS_MANAGE, PERMISSIONS.USERS_TEAM]) ? (
                  <Link to="/users" className={styles.sectionLink}>
                    View all
                  </Link>
                ) : null}
              </div>
              <div className={styles.recentCard}>
                {!data?.recentUsers?.length ? (
                  <p className={styles.recentEmpty}>
                    {scope === 'team' ? 'No agents yet' : 'No users yet'}
                  </p>
                ) : (
                  <ul className={styles.recentList}>
                    {data.recentUsers.map((u) => (
                      <li key={u.id} className={styles.recentItem}>
                        <Link to="/users" className={styles.recentLink}>
                          <span className={styles.recentName}>{u.name?.trim() || u.email}</span>
                          <span className={styles.recentMeta}>{u.role}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
