import React from 'react';
import styles from './DialerStageStepper.module.scss';

const STAGES = [
  { id: 'setup', label: 'Configure', short: '1' },
  { id: 'review', label: 'Review', short: '2' },
  { id: 'dial', label: 'Dial', short: '3' },
  { id: 'complete', label: 'Complete', short: '4' },
];

/**
 * @param {{ current: 'setup' | 'review' | 'dial' | 'complete', className?: string }} props
 */
export function DialerStageStepper({ current, className = '' }) {
  const idx = STAGES.findIndex((s) => s.id === current);

  return (
    <nav className={`${styles.stepper} ${className}`.trim()} aria-label="Dialer session progress">
      <ol className={styles.list}>
        {STAGES.map((stage, i) => {
          const done = i < idx;
          const active = stage.id === current;
          return (
            <li
              key={stage.id}
              className={`${styles.item} ${done ? styles.itemDone : ''} ${active ? styles.itemActive : ''}`.trim()}
            >
              <span className={styles.marker} aria-hidden>
                {done ? '✓' : stage.short}
              </span>
              <span className={styles.label}>{stage.label}</span>
              {i < STAGES.length - 1 ? <span className={styles.connector} aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
