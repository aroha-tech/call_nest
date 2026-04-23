import React from 'react';
import { Link } from 'react-router-dom';
import styles from './NotificationBell.module.scss';

function timeText(v) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
}

export function NotificationPanel({ items, onMarkRead, onMarkAllRead, onClose }) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>Notifications</span>
        <button type="button" onClick={onMarkAllRead}>
          Mark all read
        </button>
      </div>
      <div className={styles.panelList}>
        {(items || []).map((n) => (
          <Link
            key={n.id}
            to={n.cta_path || '/notifications'}
            className={`${styles.item} ${n.read_at ? '' : styles.itemUnread}`}
            onClick={() => {
              if (!n.read_at) onMarkRead?.(n.id);
              onClose?.();
            }}
          >
            <div className={styles.meta}>
              {n.module_key} · {timeText(n.created_at)}
            </div>
            <div className={styles.title}>{n.title}</div>
            {n.body ? <div className={styles.body}>{n.body}</div> : null}
          </Link>
        ))}
      </div>
      <div className={styles.panelFooter}>
        <Link className={styles.linkBtn} to="/notifications" onClick={onClose}>
          View all
        </Link>
      </div>
    </div>
  );
}

