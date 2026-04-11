import React from 'react';
import { Button } from './Button';
import styles from './Pagination.module.scss';

export const LIMIT_OPTIONS = [10, 20, 50, 100, 500];

/** Rows-per-page control — use above the table with search */
export function PaginationPageSize({ limit = 10, onLimitChange, className = '' }) {
  if (!onLimitChange) return null;
  return (
    <div className={`${styles.pageSizeToolbar} ${className}`}>
      <div className={styles.limitSelect}>
        <label>Rows:</label>
        <select
          value={limit}
          onChange={(e) => onLimitChange(Number(e.target.value))}
          className={styles.select}
        >
          {LIMIT_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function Pagination({
  page = 1,
  totalPages = 1,
  total = 0,
  limit = 10,
  onPageChange,
  onLimitChange,
  hidePageSize = false,
  className = '',
}) {
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div className={`${styles.pagination} ${styles.paginationFooter} ${className}`}>
      <div className={styles.left}>
        <span className={styles.info}>
          Showing {start}-{end} of {total}
        </span>
        {!hidePageSize && onLimitChange && (
          <div className={styles.limitSelect}>
            <label>Rows:</label>
            <select
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              className={styles.select}
            >
              {LIMIT_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {totalPages > 1 && (
        <div className={styles.controls}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            ← Prev
          </Button>
          <span className={styles.page}>
            Page {page} of {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            Next →
          </Button>
        </div>
      )}
    </div>
  );
}
