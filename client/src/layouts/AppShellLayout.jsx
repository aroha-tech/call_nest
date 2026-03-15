import React, { useState, useEffect } from 'react';
import { useSalesNavigation } from '../hooks/useSalesNavigation';
import styles from './AppShellLayout.module.scss';

/**
 * Expandable navigation group component.
 */
function NavGroup({ item, activeKey, activeParentKey, onNavigate, expandedGroups, toggleGroup }) {
  const isExpanded = expandedGroups[item.key];
  const isActive = activeParentKey === item.key;

  return (
    <div className={styles.navGroup}>
      <button
        type="button"
        className={`${styles.navGroupHeader} ${isActive ? styles.navGroupActive : ''}`}
        onClick={() => toggleGroup(item.key)}
        aria-expanded={isExpanded}
      >
        <span className={styles.navLabel}>{item.label}</span>
        <span className={`${styles.navChevron} ${isExpanded ? styles.expanded : ''}`}>
          ▸
        </span>
      </button>
      {isExpanded && (
        <div className={styles.navGroupChildren}>
          {item.children.map((child) => (
            <button
              key={child.key}
              type="button"
              className={`${styles.navChild} ${activeKey === child.key ? styles.navChildActive : ''}`}
              onClick={() => onNavigate(child.path)}
            >
              <span className={styles.navLabel}>{child.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Base authenticated app shell with responsive sidebar.
 */
export function AppShellLayout({ children }) {
  const { items, activeKey, activeParentKey, goTo, tenantSlug, isPlatform } = useSalesNavigation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({});

  useEffect(() => {
    if (activeParentKey) {
      setExpandedGroups((prev) => ({ ...prev, [activeParentKey]: true }));
    }
  }, [activeParentKey]);

  const handleNavClick = (path) => {
    goTo(path);
    setSidebarOpen(false);
  };

  const toggleGroup = (key) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const findCurrentLabel = () => {
    for (const item of items) {
      if (item.children) {
        const child = item.children.find((c) => c.key === activeKey);
        if (child) return child.label;
      } else if (item.key === activeKey) {
        return item.label;
      }
    }
    return 'Dashboard';
  };

  return (
    <div className={styles.shell}>
      {/* Mobile overlay */}
      <div 
        className={`${styles.mobileOverlay} ${sidebarOpen ? styles.visible : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.open : ''}`}>
        <div className={styles.sidebarHeader}>
          <span className={styles.brand}>Call Nest</span>
          <span className={styles.tenant}>
            {isPlatform ? 'Platform Admin' : tenantSlug ?? 'Workspace'}
          </span>
        </div>
        <nav className={styles.nav}>
          {items.map((item) =>
            item.children ? (
              <NavGroup
                key={item.key}
                item={item}
                activeKey={activeKey}
                activeParentKey={activeParentKey}
                onNavigate={handleNavClick}
                expandedGroups={expandedGroups}
                toggleGroup={toggleGroup}
              />
            ) : (
              <button
                key={item.key}
                type="button"
                className={`${styles.navItem} ${activeKey === item.key ? styles.navItemActive : ''}`}
                onClick={() => handleNavClick(item.path)}
              >
                <span className={styles.navLabel}>{item.label}</span>
              </button>
            )
          )}
        </nav>
      </aside>

      {/* Main content */}
      <div className={styles.mainColumn}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <button 
              className={styles.menuBtn}
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              ☰
            </button>
            <h1 className={styles.topbarTitle}>{findCurrentLabel()}</h1>
          </div>
        </header>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
