import React from 'react';
import { Skeleton } from '../ui/Skeleton';
import { Spinner } from '../ui/Spinner';
import listStyles from './adminDataList.module.scss';
import { TableSkeletonTable } from './TableSkeletonTable';

/**
 * Wraps table empty state + scroll body. First load: table-shaped skeleton in this band only.
 * Later refetches: light scrim + spinner (no fake table grid) so columns stay aligned with real rows underneath.
 */
export function TableDataRegion({
  loading,
  hasCompletedInitialFetch,
  children,
  className = '',
  skeletonColumns = 6,
  skeletonRows = 8,
  skeletonVariant = 'table',
}) {
  const showOverlay = loading && hasCompletedInitialFetch;
  const showFirstOnlySpinner = !hasCompletedInitialFetch && loading;
  return (
    <div className={[listStyles.tableDataRegion, className].filter(Boolean).join(' ')}>
      {showOverlay ? (
        <div
          className={listStyles.tableRefreshingOverlay}
          aria-busy="true"
          aria-live="polite"
          aria-label="Updating table"
        >
          <div className={listStyles.tableRefreshingOverlayContent}>
            <Spinner size="md" />
            <span className={listStyles.tableRefreshingOverlayLabel}>Updating…</span>
          </div>
        </div>
      ) : null}
      {showFirstOnlySpinner ? (
        <div className={listStyles.firstLoadSkeletonWrap}>
          {skeletonVariant === 'table' ? (
            <TableSkeletonTable columns={skeletonColumns} rows={skeletonRows} />
          ) : (
            <div className={listStyles.tableSkeletonBlock}>
              <Skeleton height={16} width="28%" />
              <Skeleton height={16} width="100%" />
              <Skeleton height={16} width="96%" />
              <Skeleton height={16} width="92%" />
              <Skeleton height={16} width="94%" />
              <Skeleton height={16} width="88%" />
            </div>
          )}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
