import React, { useId } from 'react';
import { Select } from './Select';
import styles from './Pagination.module.scss';

export const LIMIT_OPTIONS = [10, 20, 50, 100, 500];

function getVisiblePages(page, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (page <= 3) {
    return [1, 2, 3, 4, 'dots-right', totalPages];
  }
  if (page >= totalPages - 2) {
    return [1, 'dots-left', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, 'dots-left', page - 1, page, page + 1, 'dots-right', totalPages];
}

/** Rows-per-page control — use above the table with search */
export function PaginationPageSize({ limit = 10, onLimitChange, className = '' }) {
  const limitFieldId = useId();
  if (!onLimitChange) return null;
  return (
    <div className={`${styles.pageSizeToolbar} ${className}`}>
      <div className={styles.limitSelect}>
        <label htmlFor={limitFieldId}>Rows:</label>
        <Select
          id={limitFieldId}
          compact
          className={styles.limitSelectField}
          value={String(limit)}
          onChange={(e) => onLimitChange(Number(e.target.value))}
          options={LIMIT_OPTIONS.map((opt) => ({ value: String(opt), label: String(opt) }))}
        />
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
  const limitFieldId = useId();
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  const pages = getVisiblePages(page, totalPages);

  return (
    <div className={`${styles.pagination} ${styles.paginationFooter} ${className}`}>
      <div className={styles.left}>
        <span className={styles.info}>Showing {start} to {end} of {total}</span>
        {!hidePageSize && onLimitChange && (
          <div className={styles.limitSelect}>
            <label htmlFor={limitFieldId}>Rows per page</label>
            <Select
              id={limitFieldId}
              compact
              className={styles.limitSelectField}
              value={String(limit)}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              options={LIMIT_OPTIONS.map((opt) => ({ value: String(opt), label: String(opt) }))}
            />
          </div>
        )}
      </div>
      {totalPages > 1 && (
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.navBtn}
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            ‹
          </button>
          {pages.map((p, idx) =>
            typeof p === 'number' ? (
              <button
                key={p}
                type="button"
                className={`${styles.pageBtn} ${p === page ? styles.pageBtnActive : ''}`.trim()}
                onClick={() => onPageChange(p)}
                aria-current={p === page ? 'page' : undefined}
              >
                {p}
              </button>
            ) : (
              <span key={`${p}-${idx}`} className={styles.pageDots} aria-hidden>
                …
              </span>
            )
          )}
          <button
            type="button"
            className={styles.navBtn}
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="Next page"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
