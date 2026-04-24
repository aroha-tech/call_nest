import React, { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSalesNavigation } from '../hooks/useSalesNavigation';
import { SidebarUserPanel } from './SidebarUserPanel';
import { useAppSelector } from '../app/hooks';
import { selectTenant, selectUser } from '../features/auth/authSelectors';
import { NavIcon, NavChevron } from '../components/navigation/NavIcon';
import { useColorScheme } from '../context/ColorSchemeContext';
import { getBreadcrumbItems } from './breadcrumbUtils';
import { NotificationBell } from '../features/notifications/NotificationBell';
import { useSiteEntryPermissions } from '../hooks/useSiteEntryPermissions';
import { MaterialSymbol } from '../components/ui/MaterialSymbol';
import styles from './AppShellLayout.module.scss';

/** Survives route changes: each `<Route>` wraps its own `AppShellLayout`, so the component remounts on navigation. */
const SIDEBAR_OPEN_STORAGE_KEY = 'callnest.shell.sidebarOpen';

function readStoredSidebarOpen() {
  if (typeof window === 'undefined') return null;
  try {
    const v = sessionStorage.getItem(SIDEBAR_OPEN_STORAGE_KEY);
    if (v === 'true') return true;
    if (v === 'false') return false;
  } catch {
    /* ignore */
  }
  return null;
}

function getInitialSidebarOpen() {
  const stored = readStoredSidebarOpen();
  if (stored !== null) return stored;
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(min-width: 1024px)').matches;
}

function isDesktopSidebarBreakpoint() {
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
}

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

function ThemeSunIcon() {
  return (
    <svg viewBox="0 0 24 24" width={11} height={11} aria-hidden fill="none">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      <path
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
      />
    </svg>
  );
}

function ThemeMoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width={11} height={11} aria-hidden>
      <path
        fill="currentColor"
        d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
      />
    </svg>
  );
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

/** True when the click should use default link behavior only (new tab, etc.). */
function isModifiedClick(e) {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}

/**
 * Expandable navigation group component.
 */
function NavGroup({ item, activeKey, activeParentKey, onPrimaryNavFollow, expandedGroups, toggleGroup }) {
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
            <Link
              key={child.key}
              to={child.path}
              className={`${styles.navChild} ${activeKey === child.key ? styles.navChildActive : ''}`}
              onClick={(e) => {
                if (isModifiedClick(e)) return;
                onPrimaryNavFollow?.();
              }}
            >
              <NavIcon navKey={child.key} className={styles.navChildIcon} />
              <span className={styles.navLabel}>{child.label}</span>
            </Link>
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
  const { items, activeKey, activeParentKey, tenantSlug, isPlatform } = useSalesNavigation();
  const { scheme, setScheme } = useColorScheme();
  const tenant = useAppSelector(selectTenant);
  const user = useAppSelector(selectUser);
  const [sidebarOpen, setSidebarOpen] = useState(getInitialSidebarOpen);

  useSiteEntryPermissions(user?.id);

  useEffect(() => {
    try {
      sessionStorage.setItem(SIDEBAR_OPEN_STORAGE_KEY, sidebarOpen ? 'true' : 'false');
    } catch {
      /* ignore */
    }
  }, [sidebarOpen]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setSidebarOpen(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [navSearchQuery, setNavSearchQuery] = useState('');
  const [navSearchOpen, setNavSearchOpen] = useState(false);
  const navSearchRootRef = useRef(null);
  const navSearchInputRef = useRef(null);

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

  const breadcrumbItems = useMemo(
    () => getBreadcrumbItems(location.pathname, items, isPlatform),
    [location.pathname, items, isPlatform]
  );

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

  useEffect(() => {
    if (navSearchOpen) {
      navSearchInputRef.current?.focus();
    }
  }, [navSearchOpen]);

  useEffect(() => {
    if (!navSearchOpen) return;
    const onPointerDown = (e) => {
      if (navSearchRootRef.current && !navSearchRootRef.current.contains(e.target)) {
        setNavSearchOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [navSearchOpen]);

  const closeSidebarIfMobileOverlay = () => {
    if (!isDesktopSidebarBreakpoint()) setSidebarOpen(false);
  };

  const toggleGroup = (key) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className={`${styles.shell} ${sidebarOpen ? styles.shellSidebarOpen : ''}`}>
      {/* Mobile overlay */}
      <div 
        className={`${styles.mobileOverlay} ${sidebarOpen ? styles.visible : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside
        className={`${styles.sidebar} ${sidebarOpen ? styles.open : ''}`}
        data-app-shell-sidebar
      >
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
        <div className={styles.navSearch} ref={navSearchRootRef}>
          <div
            className={`${styles.navSearchTrack} ${navSearchOpen ? styles.navSearchTrackOpen : ''}`}
          >
            <div
              className={`${styles.navSearchPill} ${!navSearchOpen ? styles.navSearchPillCollapsed : ''} ${navSearchQuery.trim() && !navSearchOpen ? styles.navSearchPillHasValue : ''}`}
            >
              {navSearchOpen ? (
                <>
                  <input
                    ref={navSearchInputRef}
                    type="text"
                    inputMode="search"
                    className={styles.navSearchPillInput}
                    placeholder="Search menu…"
                    value={navSearchQuery}
                    onChange={(e) => setNavSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setNavSearchOpen(false);
                      }
                    }}
                    aria-label="Search menu"
                    autoComplete="off"
                    spellCheck="false"
                  />
                  {navSearchQuery.trim() ? (
                    <button
                      type="button"
                      className={styles.navSearchPillClear}
                      onClick={(e) => {
                        e.stopPropagation();
                        setNavSearchQuery('');
                        navSearchInputRef.current?.focus();
                      }}
                      aria-label="Clear menu search"
                    >
                      ✕
                    </button>
                  ) : null}
                </>
              ) : null}
              <button
                type="button"
                className={styles.navSearchPillIconBtn}
                onClick={() => {
                  if (!navSearchOpen) setNavSearchOpen(true);
                }}
                aria-label={navSearchOpen ? 'Menu search' : 'Open menu search'}
                aria-expanded={navSearchOpen}
              >
                <MaterialSymbol name="search" size="sm" className={styles.navSearchSearchGlyph} />
              </button>
            </div>
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
                  onPrimaryNavFollow={closeSidebarIfMobileOverlay}
                  expandedGroups={navExpandedGroups}
                  toggleGroup={toggleGroup}
                />
              ) : (
                <Link
                  to={item.path}
                  className={`${styles.navItem} ${activeKey === item.key ? styles.navItemActive : ''}`}
                  onClick={(e) => {
                    if (isModifiedClick(e)) return;
                    closeSidebarIfMobileOverlay();
                  }}
                >
                  <span className={styles.navItemMain}>
                    <NavIcon navKey={item.key} className={styles.navItemIcon} />
                    <span className={styles.navLabel}>{item.label}</span>
                  </span>
                </Link>
              )}
            </Fragment>
          ))}
        </nav>
        <SidebarUserPanel onNavigate={closeSidebarIfMobileOverlay} />
      </aside>

      {/* Main content */}
      <div className={styles.mainColumn}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <button
              type="button"
              className={styles.menuBtn}
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={sidebarOpen}
            >
              <span className={styles.menuBtnIcon} aria-hidden>
                <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="4" y1="6" x2="20" y2="6" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="18" x2="20" y2="18" />
                </svg>
              </span>
            </button>
            <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
              {breadcrumbItems.map((crumb, index) => (
                <Fragment key={`${crumb.path}-${index}`}>
                  {index > 0 ? (
                    <span className={styles.breadcrumbSep} aria-hidden>
                      /
                    </span>
                  ) : null}
                  {crumb.isCurrent ? (
                    <span className={styles.breadcrumbCurrent} aria-current="page">
                      {crumb.label}
                    </span>
                  ) : (
                    <Link className={styles.breadcrumbLink} to={crumb.path}>
                      {crumb.label}
                    </Link>
                  )}
                </Fragment>
              ))}
            </nav>
          </div>
          <div className={styles.topbarRight}>
            <NotificationBell />
            <button
              type="button"
              role="switch"
              aria-checked={scheme === 'dark'}
              aria-label={scheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className={styles.themeSwitch}
              onClick={() => setScheme(scheme === 'light' ? 'dark' : 'light')}
            >
              <span className={styles.themeSwitchTrack}>
                <span className={`${styles.themeSwitchIcon} ${styles.themeSwitchIconSun}`}>
                  <ThemeSunIcon />
                </span>
                <span className={`${styles.themeSwitchIcon} ${styles.themeSwitchIconMoon}`}>
                  <ThemeMoonIcon />
                </span>
                <span className={styles.themeSwitchThumb} />
              </span>
            </button>
          </div>
        </header>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
