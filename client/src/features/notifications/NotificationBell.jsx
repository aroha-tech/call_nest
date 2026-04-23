import React, { useEffect, useMemo, useState } from 'react';
import { notificationAPI } from '../../services/notificationAPI';
import { connectTenantRealtimeSocket } from '../../services/tenantRealtimeSocket';
import { showForegroundBrowserNotification } from '../../services/notificationPush';
import { useAppSelector } from '../../app/hooks';
import { selectUser } from '../auth/authSelectors';
import { NotificationPanel } from './NotificationPanel';
import styles from './NotificationBell.module.scss';

export function NotificationBell() {
  const user = useAppSelector(selectUser);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  async function load() {
    try {
      const [listRes, unreadRes] = await Promise.all([
        notificationAPI.list({ limit: 8, page: 1 }),
        notificationAPI.unreadCount(),
      ]);
      setItems(listRes?.data?.data || []);
      setUnreadCount(Number(unreadRes?.data?.unreadCount || 0));
    } catch {
      // Keep shell header resilient.
    }
  }

  useEffect(() => {
    load();
    const disconnect = connectTenantRealtimeSocket({
      onEvent: (event, data) => {
        if (event === 'notification_created') {
          const ids = Array.isArray(data?.recipientUserIds) ? data.recipientUserIds.map(Number) : [];
          if (ids.includes(Number(user?.id))) {
            setItems((prev) => [data.notification, ...prev].slice(0, 8));
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

  useEffect(() => {
    const timer = setInterval(() => {
      load();
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  async function handleMarkRead(id) {
    try {
      await notificationAPI.markRead(id);
      setItems((prev) =>
        prev.map((x) => (Number(x.id) === Number(id) ? { ...x, read_at: new Date().toISOString() } : x))
      );
      setUnreadCount((x) => Math.max(0, x - 1));
    } catch {
      // noop
    }
  }

  async function handleMarkAllRead() {
    try {
      await notificationAPI.markAllRead();
      setItems((prev) => prev.map((x) => ({ ...x, read_at: x.read_at || new Date().toISOString() })));
      setUnreadCount(0);
    } catch {
      // noop
    }
  }

  const badgeText = useMemo(() => (unreadCount > 99 ? '99+' : String(unreadCount)), [unreadCount]);

  return (
    <div className={styles.bellWrap}>
      <button type="button" className={styles.bellBtn} onClick={() => setOpen((v) => !v)} aria-label="Notifications">
        <span aria-hidden>🔔</span>
      </button>
      {unreadCount > 0 ? <span className={styles.badge}>{badgeText}</span> : null}
      {open ? (
        <NotificationPanel
          items={items}
          onMarkRead={handleMarkRead}
          onMarkAllRead={handleMarkAllRead}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

