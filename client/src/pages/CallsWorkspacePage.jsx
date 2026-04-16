import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { usePermissions } from '../hooks/usePermission';
import styles from './CallsWorkspacePage.module.scss';

/**
 * Shell for /calls/* — tabs switch between Call history and Dial sessions (single sidebar entry).
 */
export function CallsWorkspacePage() {
  const { canAny } = usePermissions();
  const canHistory = canAny(['dial.execute']);
  const canSessions = canAny(['dial.execute', 'dial.monitor']);
  const showTabs = canHistory && canSessions;

  return (
    <div className={styles.wrap}>
      {showTabs ? (
        <nav className={styles.tabList} role="tablist" aria-label="Calls views">
          {canHistory ? (
            <NavLink
              to="/calls/history"
              end
              className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`.trim()}
            >
              Call history
            </NavLink>
          ) : null}
          {canSessions ? (
            <NavLink
              to="/calls/dial-sessions"
              end
              className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`.trim()}
            >
              Dial sessions
            </NavLink>
          ) : null}
        </nav>
      ) : null}
      <Outlet />
    </div>
  );
}
