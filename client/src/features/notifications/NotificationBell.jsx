import React, { useEffect, useMemo, useState } from 'react';
import { notificationAPI } from '../../services/notificationAPI';
import { connectTenantRealtimeSocket } from '../../services/tenantRealtimeSocket';
import { showForegroundBrowserNotification } from '../../services/notificationPush';
import { useAppSelector } from '../../app/hooks';
import { selectUser } from '../auth/authSelectors';
import { ConfirmModal } from '../../components/ui/Modal';
import { NotificationPanel } from './NotificationPanel';
import { useNotificationList } from './useNotificationList';
import styles from './NotificationBell.module.scss';

export function NotificationBell() {
  const user = useAppSelector(selectUser);
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [clearAllLoading, setClearAllLoading] = useState(false);

  const { items, setItems, setTotal, loadingMore, hasMore, loadMore, reload } = useNotificationList({
    limit: 15,
  });

  async function refreshUnread() {
    try {
      const unreadRes = await notificationAPI.unreadCount();
      setUnreadCount(Number(unreadRes?.data?.unreadCount || 0));
    } catch {
      /* keep shell resilient */
    }
  }

  useEffect(() => {
    refreshUnread();
    const disconnect = connectTenantRealtimeSocket({
      onEvent: (event, data) => {
        if (event === 'notification_created') {
          const ids = Array.isArray(data?.recipientUserIds) ? data.recipientUserIds.map(Number) : [];
          if (ids.includes(Number(user?.id))) {
            const nid = Number(data.notification?.id);
            setItems((prev) => {
              if (!nid || prev.some((x) => Number(x.id) === nid)) return prev;
              return [data.notification, ...prev];
            });
            setTotal((t) => t + 1);
            setUnreadCount((x) => x + 1);
            showForegroundBrowserNotification(data.notification);
          }
        }
        if (event === 'notification_unread_count' && Number(data?.userId) === Number(user?.id)) {
          setUnreadCount(Number(data?.unreadCount || 0));
        }
      },
      onError: () => {},
    });
    return () => disconnect();
  }, [user?.id]);

  function handleBellToggle() {
    setOpen((prev) => {
      const next = !prev;
      if (next) refreshUnread();
      return next;
    });
  }

  async function handleMarkRead(id) {
    try {
      await notificationAPI.markRead(id);
      setItems((prev) =>
        prev.map((x) => (Number(x.id) === Number(id) ? { ...x, read_at: new Date().toISOString() } : x))
      );
      setUnreadCount((x) => Math.max(0, x - 1));
    } catch {
      /* noop */
    }
  }

  async function handleMarkAllRead() {
    try {
      await notificationAPI.markAllRead();
      setItems((prev) => prev.map((x) => ({ ...x, read_at: x.read_at || new Date().toISOString() })));
      setUnreadCount(0);
    } catch {
      /* noop */
    }
  }

  async function handleDismiss(id) {
    try {
      await notificationAPI.dismiss(id);
      setItems((prev) => prev.filter((x) => Number(x.id) !== Number(id)));
      setTotal((t) => Math.max(0, t - 1));
      await refreshUnread();
    } catch {
      /* noop */
    }
  }

  async function handleClearAllConfirm() {
    setClearAllLoading(true);
    try {
      await notificationAPI.dismissAll({});
      setClearAllOpen(false);
      await reload();
      await refreshUnread();
    } catch {
      /* noop */
    } finally {
      setClearAllLoading(false);
    }
  }

  const badgeText = useMemo(() => (unreadCount > 99 ? '99+' : String(unreadCount)), [unreadCount]);

  return (
    <div className={styles.bellWrap}>
      <button type="button" className={styles.bellBtn} onClick={handleBellToggle} aria-label="Notifications">
        <svg className={styles.bellIcon} viewBox="0 0 24 24" width={22} height={22} aria-hidden fill="none">
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
      </button>
      {unreadCount > 0 ? <span className={styles.badge}>{badgeText}</span> : null}
      {open ? (
        <NotificationPanel
          items={items}
          onMarkRead={handleMarkRead}
          onMarkAllRead={handleMarkAllRead}
          onClearAll={() => setClearAllOpen(true)}
          onClose={() => setOpen(false)}
          onDismiss={handleDismiss}
          hasMore={hasMore}
          loadingMore={loadingMore}
          loadMore={loadMore}
        />
      ) : null}
      <ConfirmModal
        isOpen={clearAllOpen}
        onClose={() => {
          if (!clearAllLoading) setClearAllOpen(false);
        }}
        onConfirm={handleClearAllConfirm}
        title="Clear all notifications"
        message="Remove every alert from your list for now? You can still receive new ones; items older than the retention window stay hidden automatically."
        confirmText="Clear all"
        variant="danger"
        loading={clearAllLoading}
      />
    </div>
  );
}
