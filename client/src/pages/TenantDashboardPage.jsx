import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppSelector } from '../app/hooks';
import { selectUser } from '../features/auth/authSelectors';
import { usePermissions } from '../hooks/usePermission';
import { tenantDashboardAPI } from '../services/tenantAPI';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
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
import { formatDateTimeDisplay, formatTimeDisplay } from '../utils/dateTimeDisplay';
import {
  ActivityFeedTable,
  ActivityFullHistoryLink,
  ROLE_LABELS,
  activityTabsForRole,
} from '../features/activity';
import styles from './TenantDashboardPage.module.scss';

const ROLE_ORDER = ['admin', 'manager', 'agent'];

/** Recent activity card: show only the newest rows; full list is on /activities. */
const DASHBOARD_ACTIVITY_PREVIEW_LIMIT = 5;

/** Meetings calendar in dashboard widgets (legacy path redirects to schedule). */
const DASHBOARD_MEETINGS_PATH = '/email/meetings';

/** Fixed number of rows in meetings / callbacks / connected-calls dashboard cards (extras → full list links). */
const DASHBOARD_LIST_SLOT_COUNT = 3;

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
  return formatTimeDisplay(startAt, mode);
}

function contactPath(row) {
  if (!row?.contact_id) return null;
  const t = String(row.contact_type || '').toLowerCase();
  return t === 'lead' ? `/leads/${row.contact_id}` : `/contacts/${row.contact_id}`;
}

function isPendingCallbackOverdue(scheduledAt) {
  const d = scheduledAt ? new Date(String(scheduledAt).replace(' ', 'T')) : null;
  if (!d || Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
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
  const [activityFeedFilter, setActivityFeedFilter] = useState('all');
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false);
  const rangeWrapRef = useRef(null);

  const role = user?.role ?? 'agent';
  const dtMode = user?.datetimeDisplayMode ?? 'ist_fixed';
  const canCallHistory = canAny([PERMISSIONS.DIAL_EXECUTE, PERMISSIONS.DIAL_MONITOR]);

  useEffect(() => {
    activeRangeRef.current = activeRange;
  }, [activeRange]);

  useEffect(() => {
    if (role === 'agent' && activityFeedFilter === 'team') setActivityFeedFilter('all');
  }, [role, activityFeedFilter]);

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

  const activityFeedFiltered = useMemo(() => {
    const rows = data?.activityFeed ?? [];
    if (activityFeedFilter === 'all') return rows;
    if (activityFeedFilter === 'calls') return rows.filter((x) => x.kind === 'call' || x.kind === 'dialer');
    if (activityFeedFilter === 'records')
      return rows.filter((x) =>
        ['crm', 'whatsapp', 'email', 'settings', 'workspace'].includes(x.kind)
      );
    if (activityFeedFilter === 'team') return rows.filter((x) => x.kind === 'teammate');
    return rows;
  }, [data?.activityFeed, activityFeedFilter]);

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
  const pendingCallbacks = data?.pendingCallbacks ?? [];
  const recentConnectedCalls = data?.recentConnectedCalls ?? [];
  const meetingsPreview = upcomingMeetings.slice(0, DASHBOARD_LIST_SLOT_COUNT);
  const meetingsHasMore = upcomingMeetings.length > DASHBOARD_LIST_SLOT_COUNT;
  const callbacksPreview = pendingCallbacks.slice(0, DASHBOARD_LIST_SLOT_COUNT);
  const callbacksHasMore = pendingCallbacks.length > DASHBOARD_LIST_SLOT_COUNT;
  const callsPreview = recentConnectedCalls.slice(0, DASHBOARD_LIST_SLOT_COUNT);
  const callsHasMore = recentConnectedCalls.length > DASHBOARD_LIST_SLOT_COUNT;
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
            to={canMeetings ? DASHBOARD_MEETINGS_PATH : undefined}
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
                    <Link to={DASHBOARD_MEETINGS_PATH} className={styles.panelTitleAnchor}>
                      <MaterialSymbol name="event_upcoming" size="sm" className={styles.panelTitleIcon} />
                      Upcoming meetings
                    </Link>
                  </h2>
                  <Link to={DASHBOARD_MEETINGS_PATH} className={styles.panelLink}>
                    Calendar
                  </Link>
                </div>
                <ul className={`${styles.meetingList} ${styles.dashboardListSlots}`}>
                  {Array.from({ length: DASHBOARD_LIST_SLOT_COUNT }, (_, slot) => {
                    const m = meetingsPreview[slot];
                    if (m) {
                      const joinUrl =
                        m.location && /^https?:\/\//i.test(String(m.location).trim())
                          ? String(m.location).trim()
                          : null;
                      return (
                        <li key={m.id} className={`${styles.meetingRow} ${styles.dashboardSlotRow}`}>
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
                            <Link to={DASHBOARD_MEETINGS_PATH} className={styles.joinBtn}>
                              <span className={styles.joinBtnInner}>
                                <MaterialSymbol name="event" size="sm" />
                                Open
                              </span>
                            </Link>
                          )}
                        </li>
                      );
                    }
                    const emptyFirst = slot === 0 && upcomingMeetings.length === 0;
                    return (
                      <li
                        key={`meeting-slot-${slot}`}
                        className={styles.dashboardSlotSpacer}
                        aria-hidden={!emptyFirst}
                      >
                        {emptyFirst ? (
                          <span className={styles.slotEmptyHint}>No upcoming meetings in your scope.</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                {meetingsHasMore ? (
                  <Link
                    to={DASHBOARD_MEETINGS_PATH}
                    className={styles.panelLink}
                    style={{ marginTop: 12, display: 'inline-block' }}
                  >
                    All meetings {'\u2192'}
                  </Link>
                ) : null}
              </section>
            ) : null}

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <h2 className={styles.panelTitleWithIcon}>
                  {canCallHistory ? (
                    <Link to="/calls/history" className={styles.panelTitleAnchor}>
                      <MaterialSymbol name="phone_callback" size="sm" className={styles.panelTitleIcon} />
                      Connected calls
                    </Link>
                  ) : (
                    <>
                      <MaterialSymbol name="phone_callback" size="sm" className={styles.panelTitleIcon} />
                      Connected calls
                    </>
                  )}
                </h2>
                <div className={styles.callsHeadStats}>
                  <span className={styles.callStatPill}>{callsToday.count ?? 0} today</span>
                  <span className={styles.callStatPill}>{avgToday} avg</span>
                </div>
              </div>
              <ul className={`${styles.meetingList} ${styles.dashboardListSlots}`}>
                {Array.from({ length: DASHBOARD_LIST_SLOT_COUNT }, (_, slot) => {
                  const row = callsPreview[slot];
                  if (row) {
                    const cp = contactPath(row);
                    const name = row.display_name?.trim() || `Contact #${row.contact_id}`;
                    return (
                      <li key={row.id} className={`${styles.meetingRow} ${styles.dashboardSlotRow}`}>
                        <span className={styles.meetingTime}>
                          {formatDateTimeDisplay(row.started_at, dtMode)}
                        </span>
                        <div className={styles.meetingBody}>
                          <p className={styles.meetingTitle}>
                            {cp ? (
                              <Link to={cp} className={styles.leadLink}>
                                {name}
                              </Link>
                            ) : (
                              name
                            )}
                          </p>
                          <p className={styles.meetingMeta}>
                            {formatDurationSec(row.duration_sec)} ·{' '}
                            <span className={styles.dispoPill}>
                              {row.disposition_name?.trim() || '—'}
                            </span>
                          </p>
                        </div>
                        {cp ? (
                          <Link to={cp} className={styles.joinBtn}>
                            <span className={styles.joinBtnInner}>
                              <MaterialSymbol name="person" size="sm" />
                              Contact
                            </span>
                          </Link>
                        ) : canCallHistory ? (
                          <Link to="/calls/history" className={styles.joinBtn}>
                            <span className={styles.joinBtnInner}>
                              <MaterialSymbol name="history" size="sm" />
                              History
                            </span>
                          </Link>
                        ) : null}
                      </li>
                    );
                  }
                  const emptyFirst = slot === 0 && !recentConnectedCalls.length;
                  return (
                    <li
                      key={`calls-slot-${slot}`}
                      className={styles.dashboardSlotSpacer}
                      aria-hidden={!emptyFirst}
                    >
                      {emptyFirst ? (
                        <span className={styles.slotEmptyHint}>No connected calls in your scope yet.</span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              {canCallHistory ? (
                <Link
                  to="/calls/history"
                  className={styles.panelLink}
                  style={{ marginTop: 12, display: 'inline-block' }}
                >
                  {callsHasMore ? `All connected calls (${recentConnectedCalls.length}) ` : 'Full call history '}
                  {'\u2192'}
                </Link>
              ) : null}
            </section>
          </div>

          <div className={styles.sideStack}>
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <h2 className={styles.panelTitleWithIcon}>
                  {can(PERMISSIONS.SCHEDULE_VIEW) ? (
                    <Link to="/schedule/callbacks" className={styles.panelTitleAnchor}>
                      <MaterialSymbol name="ring_volume" size="sm" className={styles.panelTitleIcon} />
                      Pending callbacks
                    </Link>
                  ) : (
                    <>
                      <MaterialSymbol name="ring_volume" size="sm" className={styles.panelTitleIcon} />
                      Pending callbacks
                    </>
                  )}
                </h2>
                {can(PERMISSIONS.SCHEDULE_VIEW) ? (
                  <Link to="/schedule/callbacks" className={styles.panelLink}>
                    Open callbacks
                  </Link>
                ) : null}
              </div>
              {can(PERMISSIONS.SCHEDULE_VIEW) ? (
                <>
                  <ul className={`${styles.meetingList} ${styles.dashboardListSlots}`}>
                    {Array.from({ length: DASHBOARD_LIST_SLOT_COUNT }, (_, slot) => {
                      const cb = callbacksPreview[slot];
                      if (cb) {
                        const cp = contactPath(cb);
                        const overdue = isPendingCallbackOverdue(cb.scheduled_at);
                        const showAssignee = role === 'admin' || role === 'manager';
                        const metaParts = [
                          cb.contact_phone?.trim() || null,
                          showAssignee && cb.assigned_name?.trim() ? cb.assigned_name.trim() : null,
                        ].filter(Boolean);
                        const title =
                          cb.contact_name?.trim() ||
                          (cb.contact_id ? `Contact #${cb.contact_id}` : 'Callback');
                        return (
                          <li key={cb.id} className={`${styles.meetingRow} ${styles.dashboardSlotRow}`}>
                            <span
                              className={`${styles.meetingTime} ${overdue ? styles.callbackTimeOverdue : ''}`.trim()}
                            >
                              {overdue ? (
                                <>
                                  <span className={styles.callbackDueLabel}>Overdue</span>
                                  <br />
                                </>
                              ) : null}
                              {formatMeetingSlot(cb.scheduled_at, dtMode)}
                            </span>
                            <div className={styles.meetingBody}>
                              <p className={styles.meetingTitle}>
                                {cp ? (
                                  <Link to={cp} className={styles.leadLink}>
                                    {title}
                                  </Link>
                                ) : (
                                  title
                                )}
                              </p>
                              <p className={styles.meetingMeta}>
                                {metaParts.length ? metaParts.join(' · ') : '—'}
                                {cb.notes?.trim() ? ` · ${cb.notes.trim()}` : ''}
                              </p>
                            </div>
                            <Link to="/schedule/callbacks" className={styles.joinBtn}>
                              <span className={styles.joinBtnInner}>
                                <MaterialSymbol name="event" size="sm" />
                                Open
                              </span>
                            </Link>
                          </li>
                        );
                      }
                      const emptyFirst = slot === 0 && pendingCallbacks.length === 0;
                      return (
                        <li
                          key={`cb-slot-${slot}`}
                          className={styles.dashboardSlotSpacer}
                          aria-hidden={!emptyFirst}
                        >
                          {emptyFirst ? (
                            <span className={styles.slotEmptyHint}>
                              No pending callbacks in your scope. Open{' '}
                              <Link to="/schedule/callbacks" className={styles.inlineDashLink}>
                                Callbacks
                              </Link>{' '}
                              to add one.
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                  {callbacksHasMore ? (
                    <Link
                      to="/schedule/callbacks"
                      className={styles.panelLink}
                      style={{ marginTop: 12, display: 'inline-block' }}
                    >
                      All callbacks ({pendingCallbacks.length}) {'\u2192'}
                    </Link>
                  ) : null}
                  {pendingCallbacks.length === 0 ? (
                    <p className={styles.skeletonNote} style={{ marginTop: 10, marginBottom: 0 }}>
                      You can also use{' '}
                      {canCallHistory ? (
                        <Link to="/calls/history" className={styles.inlineDashLink}>
                          Call history
                        </Link>
                      ) : (
                        'Call history'
                      )}
                      {' '}and{' '}
                      {canDial ? (
                        <Link to="/dialer" className={styles.inlineDashLink}>
                          your dialer queue
                        </Link>
                      ) : (
                        'your dialer queue'
                      )}
                      .
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  <p className={styles.skeletonNote}>
                    Scheduled callbacks live in the Schedule hub when your role includes schedule access. For call
                    context, use{' '}
                    {canCallHistory ? (
                      <Link to="/calls/history" className={styles.inlineDashLink}>
                        Call history
                      </Link>
                    ) : (
                      'Call history'
                    )}
                    {' '}and{' '}
                    {canDial ? (
                      <Link to="/dialer" className={styles.inlineDashLink}>
                        your dialer queue
                      </Link>
                    ) : (
                      'your dialer queue'
                    )}
                    .
                  </p>
                </>
              )}
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
                  <Link to={DASHBOARD_MEETINGS_PATH} className={styles.quickBtn}>
                    <MaterialSymbol name="calendar_month" size="md" className={styles.quickBtnMat} />
                    <span>Meeting</span>
                  </Link>
                ) : null}
              </div>
            </section>
          </div>
        </div>

        <section className={styles.activityFeedPanel}>
          <div className={styles.activityFeedHead}>
            <div>
              <h2 className={styles.activityFeedTitleMain}>Recent activity</h2>
              <p className={styles.activityFeedSub}>
                Live feed from your workspace (role-scoped). Open a row to view the record.
              </p>
            </div>
            <div className={styles.activityTabs} role="tablist" aria-label="Filter activity">
              {activityTabsForRole(role).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={activityFeedFilter === t.id}
                  className={`${styles.activityTab} ${activityFeedFilter === t.id ? styles.activityTabActive : ''}`.trim()}
                  onClick={() => setActivityFeedFilter(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {activityFeedFiltered.length === 0 ? (
            <p className={styles.activityFeedEmpty}>No recent items match this filter.</p>
          ) : (
            <ActivityFeedTable
              rows={activityFeedFiltered.slice(0, DASHBOARD_ACTIVITY_PREVIEW_LIMIT)}
              tableStyles={styles}
              dtMode={dtMode}
              navigate={navigate}
            />
          )}

          <ActivityFullHistoryLink tab={activityFeedFilter} />
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
