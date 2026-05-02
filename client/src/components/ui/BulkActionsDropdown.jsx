import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import contactPageStyles from '../../features/contacts/ContactsPage.module.scss';

const MENU_VIEWPORT_CLAMP_W = 320;

/**
 * Actions dropdown aligned below the trigger (fixed + portal), matching Contacts / Leads toolbar behavior.
 */
export function BulkActionsDropdown({ open, onOpenChange, trigger, children }) {
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [menuPos, setMenuPos] = useState(null);

  const updateMenuPosition = useCallback(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const margin = 8;
    const maxW = Math.min(MENU_VIEWPORT_CLAMP_W, window.innerWidth - margin * 2);
    let left = rect.left;
    if (left + maxW > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - margin - maxW);
    }
    if (left < margin) left = margin;
    setMenuPos({
      top: rect.bottom + 6,
      left,
    });
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updateMenuPosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      onOpenChange(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  const menu =
    open && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            className={contactPageStyles.bulkActionsMenu}
            style={{ top: menuPos.top, left: menuPos.left }}
            role="menu"
          >
            {children}
          </div>,
          document.body
        )
      : null;

  return (
    <div className={contactPageStyles.bulkActionsWrap} ref={wrapRef}>
      <span ref={btnRef} className={contactPageStyles.bulkActionsTriggerMeasure}>
        {trigger}
      </span>
      {menu}
    </div>
  );
}
