import React, { useId } from 'react';
import { Button } from './Button';
import { Select } from './Select';
import styles from './Pagination.module.scss';

export const LIMIT_OPTIONS = [10, 20, 50, 100, 500];

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

  return (
    <div className={`${styles.pagination} ${styles.paginationFooter} ${className}`}>
      <div className={styles.left}>
        <span className={styles.info}>
          Showing {start}-{end} of {total}
        </span>
        {!hidePageSize && onLimitChange && (
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
