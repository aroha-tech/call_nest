import React from 'react';
import { Skeleton } from '../ui/Skeleton';
import listStyles from './adminDataList.module.scss';

/**
 * Wraps table empty state + scroll body. First load: centered spinner in this band only.
 * Later refetches: semi-transparent overlay while keeping previous rows/empty state underneath.
 */
export function TableDataRegion({ loading, hasCompletedInitialFetch, children, className = '' }) {
  const showOverlay = loading && hasCompletedInitialFetch;
  const showFirstOnlySpinner = !hasCompletedInitialFetch && loading;
  return (
    <div className={[listStyles.tableDataRegion, className].filter(Boolean).join(' ')}>
      {showOverlay ? (
        <div
          className={listStyles.tableRefreshingOverlay}
          aria-busy="true"
          aria-label="Loading"
        >
          <div className={listStyles.tableSkeletonOverlay}>
            <Skeleton height={14} />
            <Skeleton height={14} width="92%" />
            <Skeleton height={14} width="86%" />
            <Skeleton height={14} width="90%" />
          </div>
        </div>
      ) : null}
      {showFirstOnlySpinner ? (
        <div className={listStyles.firstLoadSkeletonWrap}>
          <div className={listStyles.tableSkeletonBlock}>
            <Skeleton height={16} width="28%" />
            <Skeleton height={16} width="100%" />
            <Skeleton height={16} width="96%" />
            <Skeleton height={16} width="92%" />
            <Skeleton height={16} width="94%" />
            <Skeleton height={16} width="88%" />
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
