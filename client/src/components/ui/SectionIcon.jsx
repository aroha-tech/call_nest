import React from 'react';
import { MaterialSymbol } from './MaterialSymbol';
import styles from './SectionIcon.module.scss';

/**
 * Colored icon badge for section headers and KPI cards.
 * Provides consistent icon styling across the app matching modern SaaS design.
 * 
 * @param {string} icon - Material Symbol name (e.g. "person", "phone", "location_on")
 * @param {string} color - Color variant: 'blue' | 'green' | 'purple' | 'orange' | 'yellow' | 'red' | 'cyan' | 'emerald' | 'rose' | 'sky'
 * @param {string} size - Size variant: 'sm' | 'md' | 'lg'
 */
export function SectionIcon({ icon, color = 'blue', size = 'md', className = '' }) {
  const wrapClass = `${styles.iconWrap} ${styles[`iconWrap_${color}`] || ''} ${styles[`size_${size}`] || ''} ${className}`.trim();
  
  return (
    <span className={wrapClass} aria-hidden="true">
      <MaterialSymbol name={icon} size={size === 'lg' ? 'md' : 'sm'} className={styles.icon} />
    </span>
  );
}

/**
 * Section header with colored icon badge.
 * Use for section titles in forms, cards, and detail views.
 * 
 * @param {string} title - Section title text
 * @param {string} icon - Material Symbol name
 * @param {string} color - Color variant for the icon
 * @param {string} id - Optional id for accessibility (aria-labelledby)
 * @param {string} size - Icon size: 'sm' | 'md' | 'lg'
 */
export function SectionHeader({ title, icon, color = 'blue', id, size = 'md', className = '' }) {
  return (
    <div className={`${styles.sectionHeader} ${className}`.trim()}>
      <SectionIcon icon={icon} color={color} size={size} />
      <h2 id={id} className={styles.sectionTitle}>{title}</h2>
    </div>
  );
}

/**
 * Subsection header with smaller icon.
 */
export function SubsectionHeader({ title, icon, color = 'blue', className = '' }) {
  return (
    <div className={`${styles.subsectionHeader} ${className}`.trim()}>
      <SectionIcon icon={icon} color={color} size="sm" />
      <h3 className={styles.subsectionTitle}>{title}</h3>
    </div>
  );
}
