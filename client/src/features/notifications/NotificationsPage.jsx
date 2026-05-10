import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { ConfirmModal } from '../../components/ui/Modal';
import { notificationAPI } from '../../services/notificationAPI';
import { useDateTimeDisplay } from '../../hooks/useDateTimeDisplay';
import { useIntersectionLoadMore } from '../../hooks/useIntersectionLoadMore';
import { useNotificationList } from './useNotificationList';
import { NotificationItemRichPage } from './NotificationItemRich';
import styles from './NotificationsPage.module.scss';

const moduleOptions = [
  { value: '', label: 'All modules' },
  { value: 'calling', label: 'Calling' },
  { value: 'disposition', label: 'Disposition' },
  { value: 'contacts', label: 'Contacts' },
  { value: 'meetings', label: 'Meetings' },
  { value: 'schedule_hub', label: 'Schedule hub' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'email', label: 'Email' },
];

const statusOptions = [
  { value: '', label: 'All status' },
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
];

const RETENTION_DAYS = 90;

function IconFilter() {
  return (
    <svg className={styles.filterHeadingIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 4h16l-6 8v6l-4 2v-8L4 4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCheck({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 6 9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTrash({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 6h18M8 6V4h8v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6h12ZM10 11v6M14 11v6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function NotificationsPage() {
  const { formatDateTime } = useDateTimeDisplay();
  const [moduleKey, setModuleKey] = useState('');
  const [status, setStatus] = useState('');
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [clearAllLoading, setClearAllLoading] = useState(false);
  const [summary, setSummary] = useState({ all: 0, unread: 0, today: 0, week: 0 });
  const sentinelRef = useRef(null);

  const { items, setItems, total, setTotal, loading, loadingMore, hasMore, loadMore, reload } = useNotificationList({
    limit: 20,
    moduleKey,
    status,
  });

  const fetchSummary = useCallback(async () => {
    const mod = moduleKey || undefined;
    try {
      const [allRes, unRes, bulkRes] = await Promise.all([
        notificationAPI.list({ page: 1, limit: 1, module_key: mod }),
        notificationAPI.list({ page: 1, limit: 1, module_key: mod, status: 'unread' }),
        notificationAPI.list({ page: 1, limit: 500, module_key: mod }),
      ]);
      const allTotal = Number(allRes?.data?.total ?? 0);
      const unreadTotal = Number(unRes?.data?.total ?? 0);
      const rows = bulkRes?.data?.data || [];
      const now = new Date();
      const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const day = now.getDay();
      const diffToMon = (day + 6) % 7;
      const sow = new Date(sod);
      sow.setDate(sod.getDate() - diffToMon);
      let todayC = 0;
      let weekC = 0;
      for (const r of rows) {
        const d = new Date(r.created_at);
        if (d >= sod) todayC += 1;
        if (d >= sow) weekC += 1;
      }
      setSummary({ all: allTotal, unread: unreadTotal, today: todayC, week: weekC });
    } catch {
      setSummary({ all: 0, unread: 0, today: 0, week: 0 });
    }
  }, [moduleKey]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useIntersectionLoadMore({
    targetRef: sentinelRef,
    enabled: Boolean(hasMore && !loadingMore && !loading && items.length > 0),
    onLoadMore: loadMore,
    useViewport: true,
  });

  async function markRead(id) {
    await notificationAPI.markRead(id);
    setItems((prev) => prev.map((n) => (Number(n.id) === Number(id) ? { ...n, read_at: new Date().toISOString() } : n)));
    await fetchSummary();
  }

  async function markAllRead() {
    await notificationAPI.markAllRead();
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    await fetchSummary();
  }

  async function dismiss(id) {
    await notificationAPI.dismiss(id);
    setItems((prev) => prev.filter((n) => Number(n.id) !== Number(id)));
    setTotal((t) => Math.max(0, t - 1));
    await fetchSummary();
  }

  async function handleClearAllConfirm() {
    setClearAllLoading(true);
    try {
      await notificationAPI.dismissAll({
        module_key: moduleKey || undefined,
        status: status || undefined,
      });
      setClearAllOpen(false);
      await reload();
      await fetchSummary();
    } finally {
      setClearAllLoading(false);
    }
  }

  const clearAllMessage =
    moduleKey || status
      ? 'Remove every notification that matches your current Module and Status filters? Other alerts stay on your list until you dismiss them or they age out.'
      : 'Remove every alert from your list for now? You can still receive new ones; items older than the retention window stay hidden automatically.';

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroLeft}>
          <div className={styles.heroIcon} aria-hidden>
            <svg viewBox="0 0 24 24" width={28} height={28} fill="none">
              <path
                d="M12 3a5.5 5.5 0 0 0-5.5 5.5c0 2.02-.396 3.744-1.136 5.07-.37.663-.786 1.17-1.182 1.548A8.3 8.3 0 0 1 4 16.5h16a8.3 8.3 0 0 1-1.182-1.382c-.396-.378-.812-.885-1.182-1.548-.74-1.326-1.136-3.05-1.136-5.07A5.5 5.5 0 0 0 12 3Z"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="round"
              />
              <path
                d="M9.2 19a2.8 2.8 0 0 0 5.6 0"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div>
            <h1 className={styles.heroTitle}>Notifications</h1>
            <p className={styles.heroDesc}>Stay updated with important activities across your workspace.</p>
            <p className={styles.heroMeta}>
              Alerts across calling, disposition, contacts, meetings, schedule hub, tasks and email. Items older than {RETENTION_DAYS}{' '}
              days are hidden; dismiss removes an alert from your list.
            </p>
          </div>
        </div>
        <div className={styles.heroActions}>
          <Button variant="secondary" className={styles.heroMarkRead} onClick={markAllRead}>
            <IconCheck className={styles.heroBtnIcon} />
            Mark all read
          </Button>
          <Button variant="ghost" className={styles.heroClear} disabled={loading || items.length === 0} onClick={() => setClearAllOpen(true)}>
            <IconTrash className={styles.heroBtnIconMuted} />
            Clear all
          </Button>
        </div>
      </header>

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <section className={styles.filterCard}>
            <h2 className={styles.filterHeading}>
              <IconFilter />
              Filters
            </h2>
            <div className={styles.filterFields}>
              <Select
                label="Module"
                value={moduleKey}
                onChange={(e) => {
                  setModuleKey(e.target.value);
                }}
                options={moduleOptions}
              />
              <Select
                label="Status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                }}
                options={statusOptions}
              />
            </div>
          </section>

          <section className={styles.summaryCard}>
            <h3 className={styles.summaryTitle}>Notification summary</h3>
            <ul className={styles.summaryList}>
              <li>
                <button
                  type="button"
                  className={`${styles.summaryRow} ${status === '' ? styles.summaryRowActive : ''}`}
                  onClick={() => setStatus('')}
                >
                  <span>All notifications</span>
                  <span className={styles.summaryCount}>{summary.all}</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={`${styles.summaryRow} ${status === 'unread' ? styles.summaryRowActive : ''}`}
                  onClick={() => setStatus('unread')}
                >
                  <span>Unread</span>
                  <span className={`${styles.summaryCount} ${styles.summaryBadgeUnread}`}>{summary.unread}</span>
                </button>
              </li>
              <li>
                <div className={styles.summaryRowStatic}>
                  <span>Today</span>
                  <span className={`${styles.summaryCount} ${styles.summaryBadgeToday}`}>{summary.today}</span>
                </div>
              </li>
              <li>
                <div className={styles.summaryRowStatic}>
                  <span>This week</span>
                  <span className={`${styles.summaryCount} ${styles.summaryBadgeWeek}`}>{summary.week}</span>
                </div>
              </li>
            </ul>
            {summary.all > 500 ? (
              <p className={styles.summaryHint}>Today and this week counts are from your most recent 500 alerts in this module filter.</p>
            ) : null}
          </section>
        </aside>

        <main className={styles.main}>
          <div className={styles.listHeader}>
            <span className={styles.listHeaderLabel}>
              {loading ? 'Loading…' : `${total} notification${total === 1 ? '' : 's'}`}
            </span>
          </div>
          <div className={styles.list}>
            {loading ? <div className={styles.emptyState}>Loading…</div> : null}
            {!loading && items.length === 0 ? <div className={styles.emptyState}>No notifications found.</div> : null}
            {!loading
              ? items.map((n) => (
                  <NotificationItemRichPage key={n.id} n={n} formatDateTime={formatDateTime} markRead={markRead} dismiss={dismiss} />
                ))
              : null}
            {!loading && items.length > 0 && hasMore ? (
              <div ref={sentinelRef} className={styles.infiniteSentinel} aria-hidden />
            ) : null}
            {loadingMore ? <div className={styles.infiniteLoading}>Loading more…</div> : null}
          </div>
        </main>
      </div>

      <ConfirmModal
        isOpen={clearAllOpen}
        onClose={() => {
          if (!clearAllLoading) setClearAllOpen(false);
        }}
        onConfirm={handleClearAllConfirm}
        title="Clear all notifications"
        message={clearAllMessage}
        confirmText="Remove all"
        variant="danger"
        loading={clearAllLoading}
      />
    </div>
  );
}
