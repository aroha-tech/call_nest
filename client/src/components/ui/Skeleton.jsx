import React from 'react';
import styles from './Skeleton.module.scss';

export function Skeleton({ width = '100%', height = 16, circle = false, className = '', style = {} }) {
  return (
    <span
      className={`${styles.skeleton} ${circle ? styles.skeletonCircle : ''} ${className}`.trim()}
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  );
}
