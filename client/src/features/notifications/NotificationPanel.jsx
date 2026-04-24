import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useDateTimeDisplay } from '../../hooks/useDateTimeDisplay';
import { useIntersectionLoadMore } from '../../hooks/useIntersectionLoadMore';
import styles from './NotificationBell.module.scss';

export function NotificationPanel({
  items,
  onMarkRead,
  onMarkAllRead,
  onClearAll,
  onClose,
  onDismiss,
  hasMore,
  loadingMore,
  loadMore,
}) {
  const { formatDateTime } = useDateTimeDisplay();
  const scrollRef = useRef(null);
  const sentinelRef = useRef(null);

  useIntersectionLoadMore({
    rootRef: scrollRef,
    targetRef: sentinelRef,
    enabled: Boolean(hasMore && !loadingMore && (items || []).length > 0),
    onLoadMore: loadMore,
  });

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>Notifications</span>
        <div className={styles.panelHeaderActions}>
          <button type="button" className={styles.panelHeaderBtn} onClick={onMarkAllRead}>
            Mark all read
          </button>
          <button
            type="button"
            className={styles.panelHeaderBtn}
            disabled={!(items || []).length}
            onClick={() => onClearAll?.()}
          >
            Clear all
          </button>
        </div>
      </div>
      <div ref={scrollRef} className={styles.panelScroll}>
        <div className={styles.panelList}>
          {(items || []).map((n) => (
            <div key={n.id} className={styles.itemRow}>
              <Link
                to={n.cta_path || '/notifications'}
                className={`${styles.item} ${n.read_at ? '' : styles.itemUnread}`}
                onClick={() => {
                  if (!n.read_at) onMarkRead?.(n.id);
                  onClose?.();
                }}
              >
                <div className={styles.meta}>
                  {n.module_key} · {formatDateTime(n.created_at)}
                </div>
                <div className={styles.title}>{n.title}</div>
                {n.body ? <div className={styles.body}>{n.body}</div> : null}
              </Link>
              <button
                type="button"
                className={styles.itemDismiss}
                aria-label="Dismiss notification"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDismiss?.(n.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        {hasMore ? <div ref={sentinelRef} className={styles.panelSentinel} aria-hidden /> : null}
        {loadingMore ? <div className={styles.panelLoadingMore}>Loading more…</div> : null}
      </div>
      <div className={styles.panelFooter}>
        <Link className={styles.linkBtn} to="/notifications" onClick={onClose}>
          View all
        </Link>
      </div>
    </div>
  );
}
