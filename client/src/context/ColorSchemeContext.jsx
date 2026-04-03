import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/** @typedef {'light' | 'dark'} ColorScheme */

export const COLOR_SCHEME_STORAGE_KEY = 'callnest-color-scheme';

/**
 * Read persisted or system preference (no localStorage access during SSR).
 * @returns {ColorScheme}
 */
export function readInitialColorScheme() {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // ignore
  }
  if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

function applyDocumentScheme(scheme) {
  const root = document.documentElement;
  root.setAttribute('data-color-scheme', scheme);
  root.style.colorScheme = scheme === 'light' ? 'light' : 'dark';
}

const ColorSchemeContext = createContext(
  /** @type {{ scheme: ColorScheme, setScheme: (s: ColorScheme) => void, toggle: () => void }} */ ({
    scheme: 'dark',
    setScheme: () => {},
    toggle: () => {},
  })
);

/**
 * Persists appearance (light / dark). Tenant brand colors still come from JWT via `applyWorkspaceTheme`.
 */
export function ColorSchemeProvider({ children }) {
  const [scheme, setSchemeState] = useState(readInitialColorScheme);

  useEffect(() => {
    applyDocumentScheme(scheme);
    try {
      window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, scheme);
    } catch {
      // ignore
    }
  }, [scheme]);

  const setScheme = useCallback((next) => {
    setSchemeState(next === 'light' ? 'light' : 'dark');
  }, []);

  const toggle = useCallback(() => {
    setSchemeState((s) => (s === 'light' ? 'dark' : 'light'));
  }, []);

  const value = useMemo(() => ({ scheme, setScheme, toggle }), [scheme, setScheme, toggle]);

  return <ColorSchemeContext.Provider value={value}>{children}</ColorSchemeContext.Provider>;
}

export function useColorScheme() {
  return useContext(ColorSchemeContext);
}
