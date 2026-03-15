import React from 'react';
import styles from './Table.module.scss';

export function Table({ children, className = '' }) {
  return (
    <div className={`${styles.wrapper} ${className}`}>
      <table className={styles.table}>{children}</table>
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

export function TableCell({ children, align = 'left', width, className = '' }) {
  return (
    <td 
      className={`${styles.cell} ${styles[align]} ${className}`}
      style={width ? { width } : undefined}
    >
      {children}
    </td>
  );
}

export function TableHeaderCell({ children, align = 'left', width, sortable, sorted, onSort }) {
  return (
    <th 
      className={`${styles.headerCell} ${styles[align]} ${sortable ? styles.sortable : ''}`}
      style={width ? { width } : undefined}
      onClick={sortable ? onSort : undefined}
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
