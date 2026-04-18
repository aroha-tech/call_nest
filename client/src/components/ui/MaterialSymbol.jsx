import React from 'react';
import styles from './MaterialSymbol.module.scss';

/**
 * Google Material Symbols Outlined (ligature names), same family as screen.html demo.
 * @param {string} name - e.g. "calendar_today", "download", "leaderboard"
 */
export function MaterialSymbol({ name, className = '', size = 'md', ...props }) {
  return (
    <span
      className={`material-symbols-outlined ${styles[size]} ${className}`.trim()}
      aria-hidden={props['aria-label'] ? undefined : true}
      {...props}
    >
      {name}
    </span>
  );
}
