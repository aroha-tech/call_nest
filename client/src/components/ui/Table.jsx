import React from 'react';
import styles from './Table.module.scss';

export function Table({ children, className = '', tableClassName = '', variant = 'default' }) {
  const admin = variant === 'adminList';
  return (
    <div className={`${styles.wrapper} ${admin ? styles.wrapperAdminList : ''} ${className}`}>
      <table
        className={`${styles.table} ${admin ? styles.tableAdminList : ''} ${tableClassName}`.trim()}
      >
        {children}
      </table>
    </div>
  );
}

export function TableHead({ children }) {
  return <thead className={styles.thead}>{children}</thead>;
}

export function TableBody({ children }) {
  return <tbody className={styles.tbody}>{children}</tbody>;
}

export function TableRow({ children, onClick, className = '' }) {
  return (
    <tr 
      className={`${styles.row} ${onClick ? styles.clickable : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function TableCell({ children, align = 'left', width, className = '', noTruncate = false }) {
  return (
    <td 
      className={`${styles.cell} ${styles[align]} ${noTruncate ? styles.noTruncate : ''} ${className}`.trim()}
      style={width ? { width } : undefined}
    >
      {children}
    </td>
  );
}

export function TableHeaderCell({
  children,
  align = 'left',
  width,
  sortable,
  sorted,
  onSort,
  noTruncate = false,
  className = '',
  onClick,
}) {
  const handleClick = onClick ?? (sortable ? onSort : undefined);
  return (
    <th 
      className={`${styles.headerCell} ${styles[align]} ${sortable ? styles.sortable : ''} ${handleClick ? styles.headerCellInteractive : ''} ${noTruncate ? styles.noTruncate : ''} ${className}`.trim()}
      style={width ? { width } : undefined}
      onClick={handleClick}
    >
      <span className={styles.headerContent}>
        {children}
        {sortable && (
          <span className={styles.sortIcon}>
            {sorted === 'asc' ? '↑' : sorted === 'desc' ? '↓' : '↕'}
          </span>
        )}
      </span>
    </th>
  );
}
