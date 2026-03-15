import React from 'react';
import { useTemplateVariables } from '../../hooks/useTemplateVariables';
import { Spinner } from '../ui/Spinner';
import { Alert } from '../ui/Alert';
import styles from './VariableSelector.module.scss';

/**
 * Displays template variables grouped by module.
 * Clicking a variable calls onInsert('{{variable_key}}').
 *
 * @param {function(string): void} onInsert - Called with e.g. '{{contact_first_name}}'
 * @param {string} [className] - Optional wrapper class
 */
export function VariableSelector({ onInsert, className = '' }) {
  const { grouped, moduleOrder, moduleLabels, loading, error } = useTemplateVariables();

  const handleClick = (key) => {
    if (typeof onInsert === 'function') {
      onInsert(`{{${key}}}`);
    }
  };

  if (loading) {
    return (
      <div className={`${styles.wrapper} ${className}`}>
        <div className={styles.loading}>
          <Spinner size="sm" /> <span>Loading variables…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${styles.wrapper} ${className}`}>
        <Alert variant="error">{error}</Alert>
      </div>
    );
  }

  return (
    <div className={`${styles.wrapper} ${className}`}>
      <p className={styles.title}>Insert variable</p>
      {moduleOrder.map((moduleKey) => {
        const list = grouped[moduleKey];
        if (!list || list.length === 0) return null;
        const sectionLabel = moduleLabels[moduleKey] || moduleKey;
        return (
          <div key={moduleKey} className={styles.section}>
            <div className={styles.sectionTitle}>{sectionLabel}</div>
            <ul className={styles.list}>
              {list.map((v) => (
                <li key={v.key}>
                  <button
                    type="button"
                    className={styles.varButton}
                    onClick={() => handleClick(v.key)}
                    title={`Insert {{${v.key}}}`}
                  >
                    {v.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
