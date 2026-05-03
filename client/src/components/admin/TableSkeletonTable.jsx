import React from 'react';
import { Skeleton } from '../ui/Skeleton';
import listStyles from './adminDataList.module.scss';

/**
 * Placeholder grid that reads as a table (header + rows) during first load or refresh overlay.
 */
export function TableSkeletonTable({ columns = 6, rows = 8, className = '' }) {
  const safeCols = Math.min(12, Math.max(2, Number(columns) || 6));
  const safeRows = Math.min(24, Math.max(1, Number(rows) || 8));
  return (
    <div
      className={[listStyles.tableSkeletonAsTable, className].filter(Boolean).join(' ')}
      style={{ ['--skel-cols']: safeCols }}
      aria-hidden="true"
    >
      <div className={listStyles.tableSkeletonHead}>
        {Array.from({ length: safeCols }, (_, c) => (
          <Skeleton
            key={`skel-th-${c}`}
            height={13}
            width={c === 0 ? '72%' : `${58 + (c % 4) * 8}%`}
          />
        ))}
      </div>
      <div className={listStyles.tableSkeletonBody}>
        {Array.from({ length: safeRows }, (_, r) => (
          <div key={`skel-tr-${r}`} className={listStyles.tableSkeletonRow}>
            {Array.from({ length: safeCols }, (_, c) => (
              <Skeleton
                key={`skel-td-${r}-${c}`}
                height={14}
                width={c === 0 ? '88%' : `${52 + ((r + c) % 5) * 9}%`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
