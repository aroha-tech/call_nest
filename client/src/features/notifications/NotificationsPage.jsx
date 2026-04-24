import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/ui/PageHeader';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { ConfirmModal } from '../../components/ui/Modal';
import { notificationAPI } from '../../services/notificationAPI';
import { useDateTimeDisplay } from '../../hooks/useDateTimeDisplay';
import { useIntersectionLoadMore } from '../../hooks/useIntersectionLoadMore';
import { useNotificationList } from './useNotificationList';
import styles from './NotificationsPage.module.scss';

const moduleOptions = [
  { value: '', label: 'All modules' },
  { value: 'calling', label: 'Calling' },
  { value: 'disposition', label: 'Disposition' },
  { value: 'contacts', label: 'Contacts' },
  { value: 'meetings', label: 'Meetings' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'email', label: 'Email' },
];

const statusOptions = [
  { value: '', label: 'All status' },
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
];

const RETENTION_DAYS = 90;

export function NotificationsPage() {
  const { formatDateTime } = useDateTimeDisplay();
  const [moduleKey, setModuleKey] = useState('');
  const [status, setStatus] = useState('');
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [clearAllLoading, setClearAllLoading] = useState(false);
  const sentinelRef = useRef(null);

  const { items, setItems, total, setTotal, loading, loadingMore, hasMore, loadMore, reload } = useNotificationList({
    limit: 20,
    moduleKey,
    status,
  });

  useIntersectionLoadMore({
    targetRef: sentinelRef,
    enabled: Boolean(hasMore && !loadingMore && !loading && items.length > 0),
    onLoadMore: loadMore,
    useViewport: true,
  });

  async function markRead(id) {
    await notificationAPI.markRead(id);
    setItems((prev) => prev.map((n) => (Number(n.id) === Number(id) ? { ...n, read_at: new Date().toISOString() } : n)));
  }

  async function markAllRead() {
    await notificationAPI.markAllRead();
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
  }

  async function dismiss(id) {
    await notificationAPI.dismiss(id);
    setItems((prev) => prev.filter((n) => Number(n.id) !== Number(id)));
    setTotal((t) => Math.max(0, t - 1));
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
      <PageHeader
        title="Notifications"
        description={`CRM alerts across calling, disposition, contacts, meetings, tasks and email. Items older than ${RETENTION_DAYS} days are hidden; dismiss removes an alert from your list.`}
      />
      <div className={styles.toolbar}>
        <div className={styles.filters}>
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
        <div className={styles.toolbarActions}>
          <Button variant="secondary" onClick={markAllRead}>
            Mark all read
          </Button>
          <Button variant="ghost" disabled={loading || items.length === 0} onClick={() => setClearAllOpen(true)}>
            Clear all
          </Button>
        </div>
      </div>

      <div className={styles.list}>
        {loading ? <div className={styles.item}>Loading...</div> : null}
        {!loading && items.length === 0 ? <div className={styles.item}>No notifications found.</div> : null}
        {!loading
          ? items.map((n) => (
              <div key={n.id} className={`${styles.item} ${n.read_at ? '' : styles.itemUnread}`}>
                <div className={styles.itemTop}>
                  <div className={styles.itemMain}>
                    <div className={styles.meta}>
                      {n.module_key} · {n.event_type} · {n.severity}
                    </div>
                    <div className={styles.title}>{n.title}</div>
                  </div>
                  <div className={`${styles.meta} ${styles.itemTime}`}>{formatDateTime(n.created_at)}</div>
                </div>
                {n.body ? <div className={styles.body}>{n.body}</div> : null}
                <div className={styles.itemActions}>
                  {!n.read_at ? (
                    <Button size="sm" variant="secondary" onClick={() => markRead(n.id)}>
                      Mark read
                    </Button>
                  ) : null}
                  <Link className={styles.openLink} to={n.cta_path || '/'}>
                    Open
                  </Link>
                  <Button size="sm" variant="ghost" onClick={() => dismiss(n.id)}>
                    Dismiss
                  </Button>
                </div>
              </div>
            ))
          : null}
        {!loading && items.length > 0 && hasMore ? (
          <div ref={sentinelRef} className={styles.infiniteSentinel} aria-hidden />
        ) : null}
        {loadingMore ? <div className={styles.infiniteLoading}>Loading more…</div> : null}
      </div>

      <ConfirmModal
        isOpen={clearAllOpen}
        onClose={() => {
          if (!clearAllLoading) setClearAllOpen(false);
        }}
        onConfirm={handleClearAllConfirm}
        title="Clear all notifications"
        message={clearAllMessage}
        confirmText="Clear all"
        variant="danger"
        loading={clearAllLoading}
      />
    </div>
  );
}
