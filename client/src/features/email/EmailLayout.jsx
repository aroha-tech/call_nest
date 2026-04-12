import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import styles from './EmailLayout.module.scss';

const NAV_ITEMS = [
  { to: '/email/sent', label: 'Sent', icon: '📤' },
  { to: '/email/meetings', label: 'Meetings', icon: '📅' },
  { to: '/email/templates', label: 'Templates', icon: '📄' },
  { to: '/email/accounts', label: 'Accounts', icon: '⚙️' },
];

export function EmailLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className={styles.wrapper}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTitle}>Email</div>
        <nav className={styles.nav}>
          {NAV_ITEMS.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => (isActive ? styles.navItemActive : styles.navItem)}
              end={false}
            >
              <span className={styles.navIcon}>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className={styles.main}>
        <div className={styles.mobileNav}>
          {NAV_ITEMS.map(({ to, label }) => {
            const isActive = location.pathname.startsWith(to);
            return (
              <button
                key={to}
                type="button"
                className={`${styles.mobileNavButton} ${isActive ? styles.active : ''}`}
                onClick={() => navigate(to)}
              >
                {label}
              </button>
            );
          })}
        </div>
        {children}
      </main>
    </div>
  );
}
