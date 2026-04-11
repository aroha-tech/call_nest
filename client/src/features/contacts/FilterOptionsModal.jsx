import React, { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import styles from './FilterOptionsModal.module.scss';

function IconPlusCircle() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * First step: create a new filter vs pick a saved one (matches list filter UX reference).
 * Highlight follows hover/focus; defaults to "Create new" (not "Use existing").
 */
export function FilterOptionsModal({ isOpen, onClose, onCreateNew, onBrowseExisting }) {
  const [activeCard, setActiveCard] = useState('create');

  useEffect(() => {
    if (isOpen) setActiveCard('create');
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Filter options" size="lg" closeOnEscape>
      <div className={styles.wrap}>
        <p className={styles.intro}>Choose how you want to filter your prospects</p>
        <div
          className={styles.cards}
          onMouseLeave={() => setActiveCard('create')}
        >
          <div
            className={`${styles.card} ${activeCard === 'create' ? styles.cardActive : ''}`}
            onMouseEnter={() => setActiveCard('create')}
            onFocusCapture={() => setActiveCard('create')}
          >
            <div
              className={`${styles.iconCircle} ${activeCard === 'create' ? styles.iconCircleActive : ''}`}
              aria-hidden
            >
              <IconPlusCircle />
            </div>
            <h3
              className={`${styles.cardTitle} ${activeCard === 'create' ? styles.cardTitleActive : ''}`}
            >
              Create new filter
            </h3>
            <p className={styles.cardDesc}>Add a new filter to refine your search results.</p>
            <button
              type="button"
              className={styles.cardActionBtn}
              onClick={() => {
                onClose();
                onCreateNew?.();
              }}
            >
              + Add new filter
            </button>
          </div>
          <div
            className={`${styles.card} ${activeCard === 'existing' ? styles.cardActive : ''}`}
            onMouseEnter={() => setActiveCard('existing')}
            onFocusCapture={() => setActiveCard('existing')}
          >
            <div
              className={`${styles.iconCircle} ${styles.iconCircleFolder} ${activeCard === 'existing' ? styles.iconCircleFolderActive : ''}`}
              aria-hidden
            >
              <IconFolder />
            </div>
            <h3
              className={`${styles.cardTitle} ${activeCard === 'existing' ? styles.cardTitleActive : ''}`}
            >
              Use existing filter
            </h3>
            <p className={styles.cardDesc}>Select from your existing filters for your results.</p>
            <button
              type="button"
              className={styles.cardActionBtn}
              onClick={() => {
                onClose();
                onBrowseExisting?.();
              }}
            >
              Browse filters
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
