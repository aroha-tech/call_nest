import React from 'react';
import { NavLink } from 'react-router-dom';
import { usePermissions } from '../hooks/usePermission';
import styles from './CallsWorkspacePage.module.scss';

export function useCallsWorkspaceShowTabs() {
  const { canAny } = usePermissions();
  const canHistory = canAny(['dial.execute']);
  const canSessions = canAny(['dial.execute', 'dial.monitor']);
  return canHistory && canSessions;
}

/** Call history / Dial sessions switcher for the Calls workspace header (right side). */
export function CallsWorkspaceTabs() {
  const show = useCallsWorkspaceShowTabs();
  if (!show) return null;

  return (
    <nav className={styles.tabListInline} role="tablist" aria-label="Calls views">
      <NavLink
        to="/calls/history"
        end
        className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`.trim()}
      >
        Call history
      </NavLink>
      <NavLink
        to="/calls/dial-sessions"
        end
        className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`.trim()}
      >
        Dial sessions
      </NavLink>
    </nav>
  );
}
