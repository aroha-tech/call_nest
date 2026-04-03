import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../app/hooks';
import { selectUser } from '../features/auth/authSelectors';
import { getUserDisplayName, getUserInitials } from '../features/auth/utils/userDisplay';
import { useLogout } from '../hooks/useLogout';
import { useColorScheme } from '../context/ColorSchemeContext';
import styles from './SidebarUserPanel.module.scss';

function SettingsIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/**
 * Bottom-of-sidebar user block: avatar, name, email, settings (Show profile), sign out.
 * @param {Object} [props]
 * @param {() => void} [props.onNavigate] - e.g. close mobile sidebar after navigation
 */
export function SidebarUserPanel({ onNavigate }) {
  const user = useAppSelector(selectUser);
  const navigate = useNavigate();
  const logout = useLogout();
  const { scheme, setScheme } = useColorScheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocMouseDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [menuOpen]);

  if (!user) return null;

  const displayName = getUserDisplayName(user);
  const initials = getUserInitials(user);
  const photo = user.profilePhotoUrl;

  function goProfile() {
    setMenuOpen(false);
    navigate('/profile');
    onNavigate?.();
  }

  return (
    <div className={styles.footer}>
      <div className={styles.row}>
        <div className={styles.avatar} aria-hidden={photo ? undefined : true}>
          {photo ? (
            <img src={photo} alt="" className={styles.avatarImg} />
          ) : (
            <span className={styles.avatarFallback}>{initials}</span>
          )}
        </div>
        <div className={styles.meta}>
          <span className={styles.name} title={displayName}>
            {displayName}
          </span>
          <span className={styles.email} title={user.email}>
            {user.email}
          </span>
        </div>
        <div className={styles.settingsWrap} ref={wrapRef}>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Account menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <SettingsIcon />
          </button>
          {menuOpen && (
            <div className={styles.menu} role="menu">
              <button type="button" className={styles.menuItem} role="menuitem" onClick={goProfile}>
                Show profile
              </button>
              <button
                type="button"
                className={styles.menuItem}
                role="menuitem"
                onClick={() => {
                  setScheme(scheme === 'light' ? 'dark' : 'light');
                  setMenuOpen(false);
                }}
              >
                {scheme === 'light' ? 'Dark mode' : 'Light mode'}
              </button>
            </div>
          )}
        </div>
      </div>
      <button type="button" className={styles.signOut} onClick={() => logout()}>
        Sign out
      </button>
    </div>
  );
}
