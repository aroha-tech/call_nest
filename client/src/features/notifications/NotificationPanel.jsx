import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useDateTimeDisplay } from '../../hooks/useDateTimeDisplay';
import { useIntersectionLoadMore } from '../../hooks/useIntersectionLoadMore';
import { NotificationItemRichPanel } from './NotificationItemRich';
import styles from './NotificationBell.module.scss';

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

function IconChevronRight({ className }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="m9 18 6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function NotificationPanel({
  items,
  unreadCount = 0,
  onMarkRead,
  onMarkAllRead,
  onClearAll,
  onClose,
  onDismiss,
  hasMore,
  loadingMore,
  loadMore,
}) {
  const { formatTime } = useDateTimeDisplay();
  const scrollRef = useRef(null);
  const sentinelRef = useRef(null);

  useIntersectionLoadMore({
    rootRef: scrollRef,
    targetRef: sentinelRef,
    enabled: Boolean(hasMore && !loadingMore && (items || []).length > 0),
    onLoadMore: loadMore,
  });

  const listLen = (items || []).length;
  const unreadLabel =
    unreadCount === 0 && listLen === 0
      ? 'No notifications yet'
      : unreadCount === 0
        ? 'All read — recent notifications below'
        : `You have ${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`;

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.panelHeaderMain}>
          <div className={styles.panelBellCircle} aria-hidden>
            <svg className={styles.panelBellGlyph} viewBox="0 0 24 24" width={22} height={22} fill="none">
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
          <div className={styles.panelTitles}>
            <div className={styles.panelTitle}>Notifications</div>
            <div className={styles.panelSubtitle}>{unreadLabel}</div>
          </div>
        </div>
        <div className={styles.panelHeaderActions}>
          <button type="button" className={styles.panelActionBtn} onClick={onMarkAllRead}>
            <IconCheck className={styles.panelActionIcon} />
            Mark all read
          </button>
          <button
            type="button"
            className={styles.panelActionBtn}
            disabled={!(items || []).length}
            onClick={() => onClearAll?.()}
          >
            <IconTrash className={styles.panelActionIcon} />
            Clear all
          </button>
        </div>
      </div>
      <div ref={scrollRef} className={styles.panelScroll}>
        <div className={styles.panelList}>
          {(items || []).map((n) => (
            <NotificationItemRichPanel
              key={n.id}
              n={n}
              formatTime={formatTime}
              onMarkRead={onMarkRead}
              onDismiss={onDismiss}
              onNavigate={onClose}
            />
          ))}
        </div>
        {hasMore ? <div ref={sentinelRef} className={styles.panelSentinel} aria-hidden /> : null}
        {loadingMore ? <div className={styles.panelLoadingMore}>Loading more…</div> : null}
      </div>
      <div className={styles.panelFooter}>
        <Link
          className={styles.viewAllLink}
          to="/notifications"
          onClick={onClose}
          data-notification-view-all="true"
        >
          View all notifications
          <IconChevronRight className={styles.viewAllChevron} />
        </Link>
      </div>
    </div>
  );
}
