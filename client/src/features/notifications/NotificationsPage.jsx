import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/ui/PageHeader';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { Pagination } from '../../components/ui/Pagination';
import { notificationAPI } from '../../services/notificationAPI';
import {
  inspectPushStatus,
  registerPushSubscriptionIfSupported,
  unregisterPushSubscriptionIfPresent,
} from '../../services/notificationPush';
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

function formatDate(v) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export function NotificationsPage() {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [moduleKey, setModuleKey] = useState('');
  const [status, setStatus] = useState('');
  const [pushStatus, setPushStatus] = useState({ state: 'checking', label: 'Checking push status...' });
  const [pushHint, setPushHint] = useState('');

  async function load() {
    setLoading(true);
    try {
      const res = await notificationAPI.list({
        page,
        limit,
        module_key: moduleKey || undefined,
        status: status || undefined,
      });
      setItems(res?.data?.data || []);
      setTotal(Number(res?.data?.total || 0));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [page, moduleKey, status]);

  useEffect(() => {
    const timer = setInterval(() => {
      load();
    }, 15000);
    return () => clearInterval(timer);
  }, [page, moduleKey, status]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await inspectPushStatus();
      if (!cancelled) setPushStatus(s);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function markRead(id) {
    await notificationAPI.markRead(id);
    setItems((prev) => prev.map((n) => (Number(n.id) === Number(id) ? { ...n, read_at: new Date().toISOString() } : n)));
  }

  async function markAllRead() {
    await notificationAPI.markAllRead();
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
  }

  async function refreshPushStatus() {
    const s = await inspectPushStatus();
    setPushStatus(s);
  }

  async function enablePush() {
    const res = await registerPushSubscriptionIfSupported();
    if (!res?.ok) {
      setPushHint(`Enable push failed: ${res?.reason || 'unknown_error'}`);
    } else {
      setPushHint('Push enabled successfully.');
    }
    await refreshPushStatus();
  }

  async function disablePush() {
    const res = await unregisterPushSubscriptionIfPresent();
    if (!res?.ok) {
      setPushHint('Disable push may be partial (no active subscription found).');
    } else {
      setPushHint('Push disabled.');
    }
    await refreshPushStatus();
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Notifications" description="CRM alerts across calling, disposition, contacts, meetings, tasks and email." />
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <Select
            label="Module"
            value={moduleKey}
            onChange={(e) => {
              setModuleKey(e.target.value);
              setPage(1);
            }}
            options={moduleOptions}
          />
          <Select
            label="Status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            options={statusOptions}
          />
        </div>
        <Button variant="secondary" onClick={markAllRead}>
          Mark all read
        </Button>
        <Button variant="ghost" onClick={enablePush}>
          Enable push
        </Button>
        <Button variant="ghost" onClick={disablePush}>
          Disable push
        </Button>
        <Button variant="ghost" onClick={refreshPushStatus}>
          Refresh push status
        </Button>
      </div>
      <div className={styles.pushStatusRow}>
        <span className={styles.pushStatusLabel}>Push status:</span>
        <span className={`${styles.pushStatusBadge} ${styles[`push_${pushStatus.state}`] || ''}`}>
          {pushStatus.label}
        </span>
        {pushHint ? <span className={styles.pushHint}>{pushHint}</span> : null}
      </div>

      <div className={styles.list}>
        {loading ? <div className={styles.item}>Loading...</div> : null}
        {!loading && items.length === 0 ? <div className={styles.item}>No notifications found.</div> : null}
        {!loading
          ? items.map((n) => (
              <div key={n.id} className={`${styles.item} ${n.read_at ? '' : styles.itemUnread}`}>
                <div className={styles.itemTop}>
                  <div>
                    <div className={styles.meta}>
                      {n.module_key} · {n.event_type} · {n.severity}
                    </div>
                    <div className={styles.title}>{n.title}</div>
                  </div>
                  <div className={styles.meta}>{formatDate(n.created_at)}</div>
                </div>
                {n.body ? <div>{n.body}</div> : null}
                <div className={styles.toolbar}>
                  {!n.read_at ? (
                    <Button size="sm" variant="secondary" onClick={() => markRead(n.id)}>
                      Mark read
                    </Button>
                  ) : null}
                  <Link to={n.cta_path || '/'}>Open</Link>
                </div>
              </div>
            ))
          : null}
      </div>

      <Pagination
        page={page}
        totalPages={Math.max(1, Math.ceil(total / limit))}
        total={total}
        limit={limit}
        onPageChange={setPage}
      />
    </div>
  );
}

