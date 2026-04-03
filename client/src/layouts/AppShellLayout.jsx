import React, { useState, useEffect, useMemo, Fragment } from 'react';
import { useLocation } from 'react-router-dom';
import { useSalesNavigation } from '../hooks/useSalesNavigation';
import { SidebarUserPanel } from './SidebarUserPanel';
import { useAppSelector } from '../app/hooks';
import { selectTenant, selectUser } from '../features/auth/authSelectors';
import { NavIcon, NavChevron } from '../components/navigation/NavIcon';
import styles from './AppShellLayout.module.scss';

/** Filter sidebar items by query (labels, section headings, child items). */
function filterNavMenuBySearch(items, query) {
  const q = query.trim().toLowerCase();
  if (!q) return items;

  const itemMatches = (item) =>
    item.label.toLowerCase().includes(q) || (item.section && item.section.toLowerCase().includes(q));

  return items
    .map((item) => {
      if (item.children?.length) {
        if (itemMatches(item)) {
          return { ...item, children: [...item.children] };
        }
        const matchingChildren = item.children.filter((c) => c.label.toLowerCase().includes(q));
        if (matchingChildren.length > 0) {
          return { ...item, children: matchingChildren };
        }
        return null;
      }
      return itemMatches(item) ? item : null;
    })
    .filter(Boolean);
}

/** Sidebar line under company name: human-readable role (not workspace slug). */
function roleLabelForSidebar(user, isPlatform) {
  if (isPlatform) return 'Platform Admin';
  const raw = user?.role;
  if (!raw || typeof raw !== 'string') return null;
  const r = raw.toLowerCase();
  if (r === 'admin') return 'Admin';
  if (r === 'manager') return 'Manager';
  if (r === 'agent') return 'Agent';
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

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
        <span className={styles.navItemMain}>
          <NavIcon navKey={item.key} className={styles.navItemIcon} />
          <span className={styles.navLabel}>{item.label}</span>
        </span>
        <NavChevron className={`${styles.navChevronSvg} ${isExpanded ? styles.navChevronExpanded : ''}`} />
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
              <NavIcon navKey={child.key} className={styles.navChildIcon} />
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
  const location = useLocation();
  const { items, activeKey, activeParentKey, goTo, tenantSlug, isPlatform } = useSalesNavigation();
  const tenant = useAppSelector(selectTenant);
  const user = useAppSelector(selectUser);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [navSearchQuery, setNavSearchQuery] = useState('');

  const filteredNavItems = useMemo(
    () => filterNavMenuBySearch(items, navSearchQuery),
    [items, navSearchQuery]
  );

  const navExpandedGroups = useMemo(() => {
    const q = navSearchQuery.trim();
    if (!q) return expandedGroups;
    const next = { ...expandedGroups };
    filteredNavItems.forEach((item) => {
      if (item.children?.length) next[item.key] = true;
    });
    return next;
  }, [navSearchQuery, expandedGroups, filteredNavItems]);

  const name = tenant?.name?.trim();
  const slug = tenantSlug ?? tenant?.slug ?? null;
  const theme = tenant?.theme;
  const titleOverride = theme?.workspaceTitle?.trim();
  const workspaceTitle = isPlatform
    ? 'Call Nest'
    : titleOverride || name || slug || 'Workspace';
  const workspaceSubtitle = roleLabelForSidebar(user, isPlatform);
  const logoUrl = !isPlatform && theme?.logoUrl ? String(theme.logoUrl).trim() : '';

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
    if (location.pathname === '/profile') return 'Profile';
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
          {logoUrl ? (
            <div className={styles.brandRow}>
              <img src={logoUrl} alt="" className={styles.brandLogo} />
              <span className={styles.brand}>{workspaceTitle}</span>
            </div>
          ) : (
            <span className={styles.brand}>{workspaceTitle}</span>
          )}
          {workspaceSubtitle != null && workspaceSubtitle !== '' && (
            <span className={styles.tenant}>{workspaceSubtitle}</span>
          )}
        </div>
        <div className={styles.navSearch}>
          <div className={styles.navSearchInner}>
            <span className={styles.navSearchIcon} aria-hidden>
              🔍
            </span>
            <input
              type="text"
              inputMode="search"
              className={styles.navSearchInput}
              placeholder="Search menu…"
              value={navSearchQuery}
              onChange={(e) => setNavSearchQuery(e.target.value)}
              aria-label="Search menu"
              autoComplete="off"
              spellCheck="false"
            />
            {navSearchQuery.trim() ? (
              <button
                type="button"
                className={styles.navSearchClear}
                onClick={() => setNavSearchQuery('')}
                aria-label="Clear menu search"
              >
                ×
              </button>
            ) : null}
          </div>
        </div>
        <nav className={styles.nav} aria-label="Main navigation">
          {filteredNavItems.length === 0 && navSearchQuery.trim() ? (
            <div className={styles.navSearchEmpty}>No menu items match</div>
          ) : null}
          {filteredNavItems.map((item) => (
            <Fragment key={item.key}>
              {item.section ? (
                <div className={styles.navSectionLabel}>{item.section}</div>
              ) : null}
              {item.children ? (
                <NavGroup
                  item={item}
                  activeKey={activeKey}
                  activeParentKey={activeParentKey}
                  onNavigate={handleNavClick}
                  expandedGroups={navExpandedGroups}
                  toggleGroup={toggleGroup}
                />
              ) : (
                <button
                  type="button"
                  className={`${styles.navItem} ${activeKey === item.key ? styles.navItemActive : ''}`}
                  onClick={() => handleNavClick(item.path)}
                >
                  <span className={styles.navItemMain}>
                    <NavIcon navKey={item.key} className={styles.navItemIcon} />
                    <span className={styles.navLabel}>{item.label}</span>
                  </span>
                </button>
              )}
            </Fragment>
          ))}
        </nav>
        <SidebarUserPanel onNavigate={() => setSidebarOpen(false)} />
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
