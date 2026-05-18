import React from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../ui/EmptyState';
import { TableDataRegion } from '../admin/TableDataRegion';
import { useTableLoadingState } from '../../hooks/useTableLoadingState';
import styles from './BillingTablePreview.module.scss';

/**
 * Compact table preview (latest N rows) with link to full history page.
 * Sized to content — not the full-viewport admin list band.
 */
export function BillingTablePreview({
  children,
  total = 0,
  previewLimit = 5,
  viewAllTo,
  viewAllLabel,
  loading = false,
  isEmpty = false,
  emptyIcon = '📋',
  emptyTitle = 'No records yet',
  emptyDescription = 'Records will appear here when available.',
  skeletonColumns = 5,
}) {
  const { hasCompletedInitialFetch } = useTableLoadingState(loading);
  const showViewAll = total > previewLimit;
  const countLabel =
    total === 0
      ? null
      : showViewAll
        ? `Showing latest ${previewLimit} of ${total}`
        : `Showing all ${total}`;

  const dataRegionClass = [
    styles.dataRegion,
    loading && !hasCompletedInitialFetch ? styles.dataRegionLoading : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <TableDataRegion
          className={dataRegionClass}
          loading={loading}
          hasCompletedInitialFetch={hasCompletedInitialFetch}
          skeletonColumns={skeletonColumns}
          skeletonRows={Math.min(previewLimit, 5)}
        >
          {isEmpty ? (
            <div className={styles.empty}>
              <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
            </div>
          ) : (
            <div className={styles.tableWrap}>{children}</div>
          )}
        </TableDataRegion>
        {!isEmpty ? (
          <div className={styles.footer}>
            {countLabel ? <span className={styles.count}>{countLabel}</span> : <span />}
            {showViewAll && viewAllTo ? (
              <Link to={viewAllTo} className={styles.viewAllLink}>
                {viewAllLabel || `View all (${total})`}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
