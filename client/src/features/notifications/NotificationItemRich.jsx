import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getNotificationPresentation,
  NotificationTypeIcon,
} from './notificationPresentation';
import styles from './NotificationItemRich.module.scss';

function IconKebab() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

function IconExternal() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M13.5 4.5H19v5.5M19 4.5l-7 7M11 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconDismiss() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function resolveCtaLabel(path) {
  const p = String(path || '').toLowerCase();
  if (p.includes('/call')) return 'View call';
  if (p.includes('/agent')) return 'View agent';
  if (p.includes('/contact')) return 'View contact';
  if (p.includes('/task')) return 'View task';
  return 'Open';
}

function PanelKebab({ unread, onMarkRead, onDismiss }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className={styles.kebabWrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.kebabBtn}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <IconKebab />
      </button>
      {open ? (
        <div className={styles.kebabMenu} role="menu">
          {unread ? (
            <button
              type="button"
              className={styles.kebabMenuBtn}
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                onMarkRead?.();
                setOpen(false);
              }}
            >
              Mark as read
            </button>
          ) : null}
          <button
            type="button"
            className={`${styles.kebabMenuBtn} ${styles.kebabMenuBtnDanger}`}
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss?.();
              setOpen(false);
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function NotificationItemRichPanel({
  n,
  formatTime,
  onMarkRead,
  onDismiss,
  onNavigate,
}) {
  const pres = getNotificationPresentation(n);
  const unread = !n.read_at;
  const { tone } = pres;

  return (
    <div className={`${styles.panelRow} ${unread ? styles.panelRowUnread : ''}`}>
      <div className={styles.panelIcon} style={{ background: tone.iconBg }}>
        <NotificationTypeIcon moduleKey={n.module_key} eventType={n.event_type} color={tone.iconColor} />
      </div>
      <div className={styles.panelBody}>
        <Link
          to={n.cta_path || '/notifications'}
          style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
          onClick={() => {
            if (unread) onMarkRead?.(n.id);
            onNavigate?.();
          }}
        >
          <div className={styles.panelTitleRow}>
            <span className={unread ? styles.unreadDot : styles.readDotFaded} aria-hidden />
            <div style={{ minWidth: 0 }}>
              <div className={styles.panelTitle}>{n.title}</div>
              {n.body ? <div className={styles.panelDesc}>{n.body}</div> : null}
              <span className={styles.panelBadge} style={{ background: tone.iconBg, color: tone.iconColor }}>
                {pres.categoryLabel}
              </span>
            </div>
          </div>
        </Link>
      </div>
      <div className={styles.panelMeta}>
        <span className={styles.panelTime}>{formatTime(n.created_at)}</span>
        <span className={`${styles.statusDot} ${unread ? styles.statusDotUnread : ''}`} aria-hidden />
        <PanelKebab
          unread={unread}
          onMarkRead={() => onMarkRead?.(n.id)}
          onDismiss={() => onDismiss?.(n.id)}
        />
      </div>
    </div>
  );
}

export function NotificationItemRichPage({ n, formatDateTime, markRead, dismiss }) {
  const pres = getNotificationPresentation(n);
  const unread = !n.read_at;
  const { tone } = pres;
  const categoryLine = `${pres.categoryLabel} · ${pres.eventKindLabel}`;
  const cta = n.cta_path || '/notifications';
  const openLabel = resolveCtaLabel(cta);

  return (
    <div className={`${styles.pageCard} ${unread ? styles.pageCardUnread : ''}`}>
      <div className={styles.pageIcon} style={{ background: tone.iconBg }}>
        <NotificationTypeIcon moduleKey={n.module_key} eventType={n.event_type} color={tone.iconColor} />
      </div>
      <div className={styles.pageCenter}>
        <div className={styles.pageCategoryRow}>
          <span className={styles.pageCategory}>{categoryLine}</span>
          {unread ? <span className={styles.newBadge}>New</span> : null}
        </div>
        <div className={styles.pageTitle}>{n.title}</div>
        {n.body ? <div className={styles.pageDesc}>{n.body}</div> : null}
        <div className={styles.pageActions}>
          {unread ? (
            <button type="button" className={styles.actionOutline} onClick={() => markRead(n.id)}>
              Mark read
            </button>
          ) : null}
          <Link className={styles.actionLink} to={cta}>
            {openLabel}
            <IconExternal />
          </Link>
          <button type="button" className={styles.actionGhost} onClick={() => dismiss(n.id)}>
            Dismiss
            <IconDismiss />
          </button>
        </div>
      </div>
      <div className={styles.pageRight}>
        <span className={styles.pageTime}>{formatDateTime(n.created_at)}</span>
        <span className={`${styles.statusDot} ${unread ? styles.statusDotUnread : ''}`} title={unread ? 'Unread' : 'Read'} />
      </div>
    </div>
  );
}
